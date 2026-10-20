import { log } from "@graphprotocol/graph-ts";
import {
  CDNServiceTerminated as CDNServiceTerminatedEvent,
  DataSetCreated as DataSetCreatedEvent,
  PDPPaymentTerminated as PDPPaymentTerminatedEvent,
  PieceAdded as PieceAddedEvent,
  ServiceTerminated as ServiceTerminatedEvent,
} from "../generated/FilecoinWarmStorageService/FilecoinWarmStorageService";
import { DataSet, Piece, Rail } from "../generated/schema";
import { decodeCommPv2Size } from "./utils/cid";
import { getDataSetEntityId, getPieceEntityId, getRailEntityId } from "./utils/keys";
import { ZERO_BIG_INT } from "./utils/metrics/constants";

export function handleDataSetCreated(event: DataSetCreatedEvent): void {
  const dataSetId = event.params.dataSetId;
  const pdpRailId = event.params.pdpRailId;
  const cacheMissRailId = event.params.cacheMissRailId;
  const cdnRailId = event.params.cdnRailId;

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

  const dataSet = new DataSet(getDataSetEntityId(dataSetId));
  dataSet.dataSetId = dataSetId;
  dataSet.payer = event.params.payer;
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
