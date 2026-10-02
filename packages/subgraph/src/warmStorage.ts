import { Address, BigInt, Bytes, dataSource, log, store } from "@graphprotocol/graph-ts";
import {
  CDNPaymentTerminated as CDNPaymentTerminatedEvent,
  DataSetCreated as DataSetCreatedEvent,
  DataSetServiceProviderChanged as DataSetServiceProviderChangedEvent,
  PieceAdded1 as LegacyPieceAddedEvent,
  PDPPaymentTerminated as PDPPaymentTerminatedEvent,
  PieceAdded as PieceAddedEvent,
  ServiceTerminated as ServiceTerminatedEvent,
} from "../generated/FilecoinWarmStorageService/FilecoinWarmStorageService";
import { PDPVerifier } from "../generated/FilecoinWarmStorageService/PDPVerifier";
import { PiecesRemoved as PiecesRemovedEvent } from "../generated/PDPVerifier/PDPVerifier";
import { DataSet, Piece, Rail } from "../generated/schema";
import { decodeCommPv2Size } from "./utils/cid";
import { createOrLoadAccountByAddress } from "./utils/helpers";
import { getDataSetEntityId, getPieceEntityId, getRailEntityId } from "./utils/keys";
import { ONE_BIG_INT, ZERO_BIG_INT } from "./utils/metrics/constants";

export function handleDataSetCreated(event: DataSetCreatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const pdpRailId = event.params.pdpRailId;
  const cacheMissRailId = event.params.cacheMissRailId;
  const cdnRailId = event.params.cdnRailId;
  const payer = event.params.payer;

  // FWSS creates the payment rails via the Payments contract before emitting this
  // event, so the Rail entities must already exist by the time this handler runs.
  const pdpRail = Rail.loadInBlock(getRailEntityId(pdpRailId));
  if (!pdpRail) {
    log.error("[handleDataSetCreated] pdpRail not found for railId: {} dataSetId: {}", [
      pdpRailId.toString(),
      dataSetId.toString(),
    ]);
    return;
  }

  const payerAccount = createOrLoadAccountByAddress(payer).account;
  payerAccount.totalDataSets = payerAccount.totalDataSets.plus(ONE_BIG_INT);
  payerAccount.save();

  const dataSet = new DataSet(getDataSetEntityId(dataSetId));
  dataSet.dataSetId = dataSetId;
  dataSet.payer = payer;
  dataSet.provider = event.params.serviceProvider;
  dataSet.pdpRail = pdpRail.id;
  if (!cacheMissRailId.isZero()) dataSet.cacheMissRail = getRailEntityId(cacheMissRailId);
  if (!cdnRailId.isZero()) dataSet.cdnRail = getRailEntityId(cdnRailId);
  dataSet.totalSize = ZERO_BIG_INT;
  dataSet.lastWriteAt = event.block.timestamp;
  dataSet.status = "ACTIVE";
  dataSet.createdAt = event.block.timestamp;
  dataSet.save();
}

// Shared by both PieceAdded signatures: the current one carries pieceCid directly,
// the legacy one has handleLegacyPieceAdded backfill it via an eth_call first.
function recordPieceAdded(dataSetId: BigInt, pieceId: BigInt, pieceCidData: Bytes, blockTimestamp: BigInt): void {
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[recordPieceAdded] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  const decoded = decodeCommPv2Size(pieceCidData);
  if (!decoded.isValid) {
    log.warning("[recordPieceAdded] Could not decode piece size for dataSetId: {} pieceId: {}", [
      dataSetId.toString(),
      pieceId.toString(),
    ]);
  }
  const size = decoded.isValid ? decoded.unpaddedSize : ZERO_BIG_INT;

  const piece = new Piece(getPieceEntityId(dataSetId, pieceId));
  piece.dataSet = dataSet.id;
  piece.size = size;
  piece.save();

  dataSet.totalSize = dataSet.totalSize.plus(size);
  dataSet.lastWriteAt = blockTimestamp;
  dataSet.save();
}

export function handlePieceAdded(event: PieceAddedEvent): void {
  recordPieceAdded(event.params.dataSetId, event.params.pieceId, event.params.pieceCid.data, event.block.timestamp);
}

// Pre-upgrade PieceAdded(dataSetId, pieceId, keys[], values[]) — no pieceCid, so this
// backfills it from PDPVerifier. Only ever runs for the closed, already-mined block
// range before the upgrade; it's not a cost future syncs keep paying.
export function handleLegacyPieceAdded(event: LegacyPieceAddedEvent): void {
  const dataSetId = event.params.dataSetId;
  const pieceId = event.params.pieceId;

  const pdpVerifierAddress = Address.fromBytes(dataSource.context().getBytes("pdpVerifierAddress"));
  const pdpVerifier = PDPVerifier.bind(pdpVerifierAddress);
  const pieceCidResult = pdpVerifier.try_getPieceCid(dataSetId, pieceId);
  if (pieceCidResult.reverted) {
    log.warning("[handleLegacyPieceAdded] getPieceCid reverted for dataSetId: {} pieceId: {}", [
      dataSetId.toString(),
      pieceId.toString(),
    ]);
  }
  const pieceCidData = pieceCidResult.reverted ? Bytes.empty() : pieceCidResult.value.data;

  recordPieceAdded(dataSetId, pieceId, pieceCidData, event.block.timestamp);
}

// PDPVerifier finalizes piece removal (FWSS.piecesScheduledRemove only schedules it), so
// this is the source of truth for keeping DataSet.totalSize accurate over time.
export function handlePiecesRemoved(event: PiecesRemovedEvent): void {
  const dataSetId = event.params.setId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) return; // not an FWSS-tracked dataset, or predates our start block

  const pieceIds = event.params.pieceIds;
  let removedSize = ZERO_BIG_INT;
  for (let i = 0; i < pieceIds.length; i++) {
    const pieceEntityId = getPieceEntityId(dataSetId, pieceIds[i]);
    const piece = Piece.load(pieceEntityId);
    if (!piece) {
      log.warning("[handlePiecesRemoved] Piece not found for dataSetId: {} pieceId: {}", [
        dataSetId.toString(),
        pieceIds[i].toString(),
      ]);
      continue;
    }
    removedSize = removedSize.plus(piece.size);
    store.remove("Piece", pieceEntityId.toHexString());
  }

  dataSet.totalSize = dataSet.totalSize.minus(removedSize);
  if (dataSet.totalSize.lt(ZERO_BIG_INT)) dataSet.totalSize = ZERO_BIG_INT;
  dataSet.save();
}

export function handleDataSetServiceProviderChanged(event: DataSetServiceProviderChangedEvent): void {
  const dataSetId = event.params.dataSetId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handleDataSetServiceProviderChanged] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  dataSet.provider = event.params.newServiceProvider;
  dataSet.save();
}

export function handlePDPPaymentTerminated(event: PDPPaymentTerminatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handlePDPPaymentTerminated] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  if (dataSet.status != "TERMINATED") {
    dataSet.status = dataSet.status == "CDN_TERMINATED" ? "TERMINATED" : "PDP_TERMINATED";
    dataSet.save();
  }
}

export function handleCDNPaymentTerminated(event: CDNPaymentTerminatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handleCDNPaymentTerminated] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  if (dataSet.status != "TERMINATED") {
    dataSet.status = dataSet.status == "PDP_TERMINATED" ? "TERMINATED" : "CDN_TERMINATED";
    dataSet.save();
  }
}

export function handleServiceTerminated(event: ServiceTerminatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handleServiceTerminated] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  dataSet.status = "TERMINATED";
  dataSet.save();
}
