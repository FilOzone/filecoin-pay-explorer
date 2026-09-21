import { Address, Bytes, DataSourceContext, ethereum, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearInBlockStore,
  clearStore,
  createMockedFunction,
  dataSourceMock,
  describe,
  test,
} from "matchstick-as";

import { DataSet } from "../../generated/schema";
import { getDataSetEntityId, getPieceEntityId, getRailEntityId } from "../../src/utils/keys";
import {
  handleCDNPaymentTerminated,
  handleDataSetServiceProviderChanged,
  handleLegacyPieceAdded,
  handlePDPPaymentTerminated,
  handlePieceAdded,
  handlePiecesRemoved,
  handleServiceTerminated,
} from "../../src/warmStorage";
import { resetEventLogIndex as resetPaymentsEventLogIndex } from "../payments/events";
import {
  createCDNPaymentTerminatedEvent,
  createDataSetServiceProviderChangedEvent,
  createLegacyPieceAddedEvent,
  createPDPPaymentTerminatedEvent,
  createPieceAddedEvent,
  createPiecesRemovedEvent,
  createServiceTerminatedEvent,
  resetEventLogIndex,
} from "./events";
import { setupDataSet, TEST_ADDRESSES } from "./fixtures";

const PDP_VERIFIER_ADDRESS = Address.fromString("0x0000000000000000000000000000000000000010");

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
    dataSourceMock.resetValues();
    resetEventLogIndex();
    resetPaymentsEventLogIndex();
  });

  test("handleDataSetCreated links the payer, provider and pdpRail", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    const id = dataSetEntityId();
    assert.fieldEquals("DataSet", id, "payer", TEST_ADDRESSES.PAYER.toHexString());
    assert.fieldEquals("DataSet", id, "provider", TEST_ADDRESSES.SERVICE_PROVIDER.toHexString());
    assert.fieldEquals("DataSet", id, "pdpRail", getRailEntityId(PDP_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "cacheMissRail", getRailEntityId(CACHE_MISS_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "cdnRail", getRailEntityId(CDN_RAIL_ID).toHexString());
    assert.fieldEquals("DataSet", id, "status", "ACTIVE");
    assert.fieldEquals("DataSet", id, "totalSize", "0");
  });

  test("handleDataSetCreated increments the payer's totalDataSets once per dataset", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);
    assert.fieldEquals("Account", TEST_ADDRESSES.PAYER.toHexString(), "totalDataSets", "1");

    setupDataSet(GraphBN.fromI32(2), GraphBN.fromI32(4));
    assert.fieldEquals("Account", TEST_ADDRESSES.PAYER.toHexString(), "totalDataSets", "2");
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

  test("handleLegacyPieceAdded backfills the size via PDPVerifier.getPieceCid", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);
    const pieceId = GraphBN.fromI32(1);

    // Exercises the real lookup path: the address comes from the data source context
    // (set from config/{network}.json in the real manifest), not a value hardcoded in the test.
    const context = new DataSourceContext();
    context.setBytes("pdpVerifierAddress", PDP_VERIFIER_ADDRESS);
    dataSourceMock.setContext(context);

    const pieceCidTuple = new ethereum.Tuple();
    pieceCidTuple.push(ethereum.Value.fromBytes(PIECE_CID_127_BYTES));
    createMockedFunction(PDP_VERIFIER_ADDRESS, "getPieceCid", "getPieceCid(uint256,uint256):((bytes))")
      .withArgs([ethereum.Value.fromUnsignedBigInt(DATA_SET_ID), ethereum.Value.fromUnsignedBigInt(pieceId)])
      .returns([ethereum.Value.fromTuple(pieceCidTuple)]);

    handleLegacyPieceAdded(createLegacyPieceAddedEvent(DATA_SET_ID, pieceId));

    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "127");
    assert.fieldEquals("Piece", getPieceEntityId(DATA_SET_ID, pieceId).toHexString(), "size", "127");
  });

  test("handlePiecesRemoved subtracts the removed pieces' sizes", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);
    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(1), PIECE_CID_127_BYTES));
    handlePieceAdded(createPieceAddedEvent(DATA_SET_ID, GraphBN.fromI32(2), PIECE_CID_254_BYTES));

    handlePiecesRemoved(createPiecesRemovedEvent(DATA_SET_ID, [GraphBN.fromI32(1)]));

    assert.fieldEquals("DataSet", dataSetEntityId(), "totalSize", "254");
    assert.notInStore("Piece", getPieceEntityId(DATA_SET_ID, GraphBN.fromI32(1)).toHexString());
  });

  test("handleDataSetServiceProviderChanged updates the provider", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID);

    handleDataSetServiceProviderChanged(
      createDataSetServiceProviderChangedEvent(
        DATA_SET_ID,
        TEST_ADDRESSES.SERVICE_PROVIDER,
        TEST_ADDRESSES.NEW_SERVICE_PROVIDER,
      ),
    );

    assert.fieldEquals("DataSet", dataSetEntityId(), "provider", TEST_ADDRESSES.NEW_SERVICE_PROVIDER.toHexString());
  });

  test("PDP and CDN termination combine into TERMINATED regardless of order", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    handlePDPPaymentTerminated(createPDPPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), PDP_RAIL_ID));
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "PDP_TERMINATED");

    handleCDNPaymentTerminated(
      createCDNPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), CACHE_MISS_RAIL_ID, CDN_RAIL_ID),
    );
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");
  });

  test("ServiceTerminated is a terminal state that later termination events cannot downgrade", () => {
    setupDataSet(DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID);

    handleServiceTerminated(
      createServiceTerminatedEvent(TEST_ADDRESSES.APPROVER, DATA_SET_ID, PDP_RAIL_ID, CACHE_MISS_RAIL_ID, CDN_RAIL_ID),
    );
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");

    handlePDPPaymentTerminated(createPDPPaymentTerminatedEvent(DATA_SET_ID, GraphBN.fromI32(100), PDP_RAIL_ID));
    assert.fieldEquals("DataSet", dataSetEntityId(), "status", "TERMINATED");
  });
});
