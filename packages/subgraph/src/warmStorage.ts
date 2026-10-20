import { log, store } from "@graphprotocol/graph-ts";
import {
  CDNServiceTerminated as CDNServiceTerminatedEvent,
  DataSetCreated as DataSetCreatedEvent,
  DataSetServiceProviderChanged as DataSetServiceProviderChangedEvent,
  PDPPaymentTerminated as PDPPaymentTerminatedEvent,
  PieceAdded as PieceAddedEvent,
  ServiceTerminated as ServiceTerminatedEvent,
} from "../generated/FilecoinWarmStorageService/FilecoinWarmStorageService";
import {
  DataSetDeleted as DataSetDeletedEvent,
  PiecesRemoved as PiecesRemovedEvent,
} from "../generated/PDPVerifier/PDPVerifier";
import { DataSet, Piece, Rail } from "../generated/schema";
import { decodeCommPv2Size } from "./utils/cid";
import { createOrLoadAccountByAddress } from "./utils/helpers";
import { getDataSetEntityId, getPieceEntityId, getRailEntityId } from "./utils/keys";
import { ZERO_BIG_INT } from "./utils/metrics/constants";

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

  createOrLoadAccountByAddress(payer);

  const dataSet = new DataSet(getDataSetEntityId(dataSetId));
  dataSet.dataSetId = dataSetId;
  dataSet.payer = payer;
  dataSet.provider = event.params.serviceProvider;
  dataSet.providerId = event.params.providerId;
  dataSet.pdpRail = pdpRail.id;
  if (!cacheMissRailId.isZero()) dataSet.cacheMissRail = getRailEntityId(cacheMissRailId);
  if (!cdnRailId.isZero()) dataSet.cdnRail = getRailEntityId(cdnRailId);
  dataSet.totalSize = ZERO_BIG_INT;
  dataSet.lastWriteAt = event.block.timestamp;
  dataSet.status = "ACTIVE";
  dataSet.createdAt = event.block.timestamp;
  dataSet.save();
}

export function handlePieceAdded(event: PieceAddedEvent): void {
  const dataSetId = event.params.dataSetId;
  const pieceId = event.params.pieceId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handlePieceAdded] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
    return;
  }

  const decoded = decodeCommPv2Size(event.params.pieceCid.data);
  if (!decoded.isValid) {
    log.warning("[handlePieceAdded] Could not decode piece size for dataSetId: {} pieceId: {}", [
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
  dataSet.lastWriteAt = event.block.timestamp;
  dataSet.save();
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

export function handleDataSetDeleted(event: DataSetDeletedEvent): void {
  const dataSet = DataSet.load(getDataSetEntityId(event.params.setId));
  if (!dataSet) return; // not an FWSS-tracked dataset, or predates our start block

  dataSet.status = "DELETED";
  dataSet.totalSize = ZERO_BIG_INT;
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

export function handleCDNServiceTerminated(event: CDNServiceTerminatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const dataSet = DataSet.load(getDataSetEntityId(dataSetId));
  if (!dataSet) {
    log.warning("[handleCDNServiceTerminated] DataSet not found for dataSetId: {}", [dataSetId.toString()]);
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
