import { Address, Bytes, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
// eslint-disable-next-line import/no-extraneous-dependencies
import { newMockEvent } from "matchstick-as";

import {
  CDNPaymentTerminated,
  DataSetCreated,
  DataSetServiceProviderChanged,
  PieceAdded1 as LegacyPieceAdded,
  PDPPaymentTerminated,
  PieceAdded,
  ServiceTerminated,
} from "../../generated/FilecoinWarmStorageService/FilecoinWarmStorageService";
import { PiecesRemoved } from "../../generated/PDPVerifier/PDPVerifier";

let nextLogIndex = 1;

export function resetEventLogIndex(): void {
  nextLogIndex = 1;
}

function newEvent(): ethereum.Event {
  const event = newMockEvent();
  event.logIndex = GraphBN.fromI32(nextLogIndex);
  nextLogIndex += 1;
  return event;
}

export function createDataSetCreatedEvent(
  dataSetId: GraphBN,
  providerId: GraphBN,
  pdpRailId: GraphBN,
  cacheMissRailId: GraphBN,
  cdnRailId: GraphBN,
  payer: Address,
  serviceProvider: Address,
  payee: Address,
  metadataKeys: string[] = [],
  metadataValues: string[] = [],
): DataSetCreated {
  const event = changetype<DataSetCreated>(newEvent());

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("providerId", ethereum.Value.fromUnsignedBigInt(providerId)));
  event.parameters.push(new ethereum.EventParam("pdpRailId", ethereum.Value.fromUnsignedBigInt(pdpRailId)));
  event.parameters.push(new ethereum.EventParam("cacheMissRailId", ethereum.Value.fromUnsignedBigInt(cacheMissRailId)));
  event.parameters.push(new ethereum.EventParam("cdnRailId", ethereum.Value.fromUnsignedBigInt(cdnRailId)));
  event.parameters.push(new ethereum.EventParam("payer", ethereum.Value.fromAddress(payer)));
  event.parameters.push(new ethereum.EventParam("serviceProvider", ethereum.Value.fromAddress(serviceProvider)));
  event.parameters.push(new ethereum.EventParam("payee", ethereum.Value.fromAddress(payee)));
  event.parameters.push(new ethereum.EventParam("metadataKeys", ethereum.Value.fromStringArray(metadataKeys)));
  event.parameters.push(new ethereum.EventParam("metadataValues", ethereum.Value.fromStringArray(metadataValues)));

  return event;
}

export function createPieceAddedEvent(
  dataSetId: GraphBN,
  pieceId: GraphBN,
  pieceCidData: Bytes,
  keys: string[] = [],
  values: string[] = [],
): PieceAdded {
  const event = changetype<PieceAdded>(newEvent());

  const pieceCid = new ethereum.Tuple();
  pieceCid.push(ethereum.Value.fromBytes(pieceCidData));

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("pieceId", ethereum.Value.fromUnsignedBigInt(pieceId)));
  event.parameters.push(new ethereum.EventParam("pieceCid", ethereum.Value.fromTuple(pieceCid)));
  event.parameters.push(new ethereum.EventParam("keys", ethereum.Value.fromStringArray(keys)));
  event.parameters.push(new ethereum.EventParam("values", ethereum.Value.fromStringArray(values)));

  return event;
}

export function createLegacyPieceAddedEvent(
  dataSetId: GraphBN,
  pieceId: GraphBN,
  keys: string[] = [],
  values: string[] = [],
): LegacyPieceAdded {
  const event = changetype<LegacyPieceAdded>(newEvent());

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("pieceId", ethereum.Value.fromUnsignedBigInt(pieceId)));
  event.parameters.push(new ethereum.EventParam("keys", ethereum.Value.fromStringArray(keys)));
  event.parameters.push(new ethereum.EventParam("values", ethereum.Value.fromStringArray(values)));

  return event;
}

export function createDataSetServiceProviderChangedEvent(
  dataSetId: GraphBN,
  oldServiceProvider: Address,
  newServiceProvider: Address,
): DataSetServiceProviderChanged {
  const event = changetype<DataSetServiceProviderChanged>(newEvent());

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("oldServiceProvider", ethereum.Value.fromAddress(oldServiceProvider)));
  event.parameters.push(new ethereum.EventParam("newServiceProvider", ethereum.Value.fromAddress(newServiceProvider)));

  return event;
}

export function createPDPPaymentTerminatedEvent(
  dataSetId: GraphBN,
  endEpoch: GraphBN,
  pdpRailId: GraphBN,
): PDPPaymentTerminated {
  const event = changetype<PDPPaymentTerminated>(newEvent());

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("endEpoch", ethereum.Value.fromUnsignedBigInt(endEpoch)));
  event.parameters.push(new ethereum.EventParam("pdpRailId", ethereum.Value.fromUnsignedBigInt(pdpRailId)));

  return event;
}

export function createCDNPaymentTerminatedEvent(
  dataSetId: GraphBN,
  endEpoch: GraphBN,
  cacheMissRailId: GraphBN,
  cdnRailId: GraphBN,
): CDNPaymentTerminated {
  const event = changetype<CDNPaymentTerminated>(newEvent());

  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("endEpoch", ethereum.Value.fromUnsignedBigInt(endEpoch)));
  event.parameters.push(new ethereum.EventParam("cacheMissRailId", ethereum.Value.fromUnsignedBigInt(cacheMissRailId)));
  event.parameters.push(new ethereum.EventParam("cdnRailId", ethereum.Value.fromUnsignedBigInt(cdnRailId)));

  return event;
}

export function createServiceTerminatedEvent(
  approver: Address,
  dataSetId: GraphBN,
  pdpRailId: GraphBN,
  cacheMissRailId: GraphBN,
  cdnRailId: GraphBN,
): ServiceTerminated {
  const event = changetype<ServiceTerminated>(newEvent());

  event.parameters.push(new ethereum.EventParam("approver", ethereum.Value.fromAddress(approver)));
  event.parameters.push(new ethereum.EventParam("dataSetId", ethereum.Value.fromUnsignedBigInt(dataSetId)));
  event.parameters.push(new ethereum.EventParam("pdpRailId", ethereum.Value.fromUnsignedBigInt(pdpRailId)));
  event.parameters.push(new ethereum.EventParam("cacheMissRailId", ethereum.Value.fromUnsignedBigInt(cacheMissRailId)));
  event.parameters.push(new ethereum.EventParam("cdnRailId", ethereum.Value.fromUnsignedBigInt(cdnRailId)));

  return event;
}

export function createPiecesRemovedEvent(setId: GraphBN, pieceIds: GraphBN[]): PiecesRemoved {
  const event = changetype<PiecesRemoved>(newEvent());

  event.parameters.push(new ethereum.EventParam("setId", ethereum.Value.fromUnsignedBigInt(setId)));
  event.parameters.push(new ethereum.EventParam("pieceIds", ethereum.Value.fromUnsignedBigIntArray(pieceIds)));

  return event;
}
