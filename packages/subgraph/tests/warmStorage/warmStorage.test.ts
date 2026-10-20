import { Bytes, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { afterEach, assert, clearInBlockStore, clearStore, describe, test } from "matchstick-as";

import { DataSet } from "../../generated/schema";
import { handleDataSetDeleted, handlePiecesRemoved } from "../../src/pdpVerifier";
import { getDataSetEntityId, getPieceEntityId, getRailEntityId } from "../../src/utils/keys";
import {
  handleCDNServiceTerminated,
  handlePDPPaymentTerminated,
  handlePieceAdded,
  handleServiceTerminated,
} from "../../src/warmStorage";
import { resetEventLogIndex } from "../payments/events";
import { TEST_ADDRESSES } from "../payments/fixtures";
import {
  createCDNServiceTerminatedEvent,
  createDataSetDeletedEvent,
  createPDPPaymentTerminatedEvent,
  createPieceAddedEvent,
  createPiecesRemovedEvent,
  createServiceTerminatedEvent,
} from "./events";
import { APPROVER, SERVICE_PROVIDER, setupDataSet } from "./fixtures";

const DATA_SET_ID = GraphBN.fromI32(1);
const PDP_RAIL_ID = GraphBN.fromI32(1);
const CACHE_MISS_RAIL_ID = GraphBN.fromI32(2);
const CDN_RAIL_ID = GraphBN.fromI32(3);

// Well-formed CommPv2 CIDs (smallest tree, zero padding). Byte layout verified in cid.test.ts.
const PIECE_CID_127_BYTES = Bytes.fromHexString(
  "0x01559120220002abababababababababababababababababababababababababababababababab",
); // 127-byte raw piece: height 2
const PIECE_CID_254_BYTES = Bytes.fromHexString(
  "0x01559120220003abababababababababababababababababababababababababababababababab",
); // 254-byte raw piece: height 3

function dataSetEntityId(): string {
  return getDataSetEntityId(DATA_SET_ID).toHexString();
}

describe("warmStorage handlers", () => {
  afterEach(() => {
    clearStore();
    clearInBlockStore();
    resetEventLogIndex();
  });

  test("handleDataSetCreated links the payer, provider, providerId and pdpRail", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    const id = dataSetEntityId();
    assert.fieldEquals("DataSet", id, "payer", TEST_ADDRESSES.ACCOUNT.toHexString());
    assert.fieldEquals("DataSet", id, "provider", SERVICE_PROVIDER.toHexString());
    assert.fieldEquals("DataSet", id, "providerId", "1");
    assert.fieldEquals("DataSet", id, "pdpRail", getRailEntityId(PDP_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "cacheMissRail", getRailEntityId(CACHE_MISS_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "cdnRail", getRailEntityId(CDN_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "status", "ACTIVE");
    assert.fieldEquals("DataSet", id, "totalSize", "0");
  });

  test("handleDataSetCreated leaves cacheMissRail and cdnRail unset without CDN", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);

    const dataSet = DataSet.load(getDataSetEntityId(DATA_SET_ID));
    assert.assertNotNull(dataSet);
    assert.assertTrue(dataSet!.cacheMissRail === null);
    assert.assertTrue(dataSet!.cdnRail === null);
  });

  test("handlePieceAdded sums decoded piece sizes into totalSize", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);

    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(1), PIECE_CID_127_BYTES));
    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "127");

    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(2), PIECE_CID_254_BYTES));
    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "381");
  });

  test("handlePiecesRemoved subtracts the removed pieces' sizes", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);
    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(1), PIECE_CID_127_BYTES));
    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(2), PIECE_CID_254_BYTES));

    handlePiecesRemoved(createPiecesRemovedEvent(DATA_SET_ID, [GraphBN.fromI32(1)]));

    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "254");
    assert.notInStore("Piece", getPieceEntityId(DATA_SET_ID, GraphBN.fromI32(1)).toHexString());
  });

  test("pieces whose concatenated ids would collide stay separate", () => {
    // fromString gives minimal-length bytes like real event params; fromI32 is always 4 bytes.
    const dataSetA = GraphBN.fromString("1");
    const pieceA = GraphBN.fromString("513");
    const dataSetB = GraphBN.fromString("257");
    const pieceB = GraphBN.fromString("2");
    setupDataSet(dataSetA, PDP_RAIL_ID);
    setupDataSet(dataSetB, GraphBN.fromI32(4));

    handlePieceAdded(createPieceAddedEvent(dataSetA, pieceA, PIECE_CID_127_BYTES));
    handlePieceAdded(createPieceAddedEvent(dataSetB, pieceB, PIECE_CID_254_BYTES));

    assert.fieldEquals("Piece", getPieceEntityId(dataSetA, pieceA).toHexString(), "size", "127");
    assert.fieldEquals("Piece", getPieceEntityId(dataSetB, pieceB).toHexString(), "size", "254");
  });

  test("handleDataSetDeleted marks the dataset DELETED and drops its pieces", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);
    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(1), PIECE_CID_127_BYTES));
    handlePDPPaymentTerminated(createPDPPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), PDP_RAIL_ID));

    handleDataSetDeleted(createDataSetDeletedEvent(DATA_SET_ID, GraphBN.fromI32(4)));

    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "DELETED");
    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "0");
    assert.notInStore("Piece", getPieceEntityId(DATA_SET_ID, GraphBN.fromI32(1)).toHexString());
  });

  test("PDP and CDN termination combine into TERMINATED regardless of order", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    handlePDPPaymentTerminated(createPDPPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), PDP_RAIL_ID));
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "PDP_TERMINATED");

    handleCDNServiceTerminated(createCDNServiceTerminatedEvent(APPROVER, DATA_SET_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID));
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");
  });

  test("ServiceTerminated is a terminal state that later termination events cannot downgrade", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    handleServiceTerminated(
      createServiceTerminatedEvent(APPROVER, DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID),
    );
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");

    handlePDPPaymentTerminated(createPDPPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), PDP_RAIL_ID));
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");
  });
});
