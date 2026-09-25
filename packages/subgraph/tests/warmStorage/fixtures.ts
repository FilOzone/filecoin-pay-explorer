import { Address, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { mockInBlockStore } from "matchstick-as";
import { Rail } from "../../generated/schema";
import { handleRailCreated } from "../../src/payments";
import { getRailEntityId } from "../../src/utils/keys";
import { handleDataSetCreated } from "../../src/warmStorage";
import { createRailCreatedEvent } from "../payments/events";
import { createDataSetCreatedEvent } from "./events";

export class TEST_ADDRESSES {
  static TOKEN: Address = Address.fromString("0x0000000000000000000000000000000000000001");
  static PAYER: Address = Address.fromString("0x0000000000000000000000000000000000000002");
  static SERVICE_PROVIDER: Address = Address.fromString("0x0000000000000000000000000000000000000003");
  static NEW_SERVICE_PROVIDER: Address = Address.fromString("0x0000000000000000000000000000000000000004");
  static PAYEE: Address = Address.fromString("0x0000000000000000000000000000000000000005");
  static VALIDATOR: Address = Address.fromString("0x0000000000000000000000000000000000000006");
  static OPERATOR: Address = Address.fromString("0x0000000000000000000000000000000000000007");
  static SERVICE_FEE_RECIPIENT: Address = Address.fromString("0x0000000000000000000000000000000000000008");
  static APPROVER: Address = Address.fromString("0x0000000000000000000000000000000000000009");
}

// FWSS creates each dataset's payment rails on the Payments contract before emitting
// DataSetCreated, so tests seed the Rail entities the same way: via a real RailCreated event.
// handleDataSetCreated reads the rail with loadInBlock, which Matchstick only resolves
// against this explicit in-block mock, not the regular store.
export function setupRail(railId: GraphBN, payer: Address = TEST_ADDRESSES.PAYER): void {
  handleRailCreated(
    createRailCreatedEvent(
      railId,
      payer,
      TEST_ADDRESSES.PAYEE,
      TEST_ADDRESSES.VALIDATOR,
      TEST_ADDRESSES.TOKEN,
      TEST_ADDRESSES.OPERATOR,
      TEST_ADDRESSES.SERVICE_FEE_RECIPIENT,
      GraphBN.zero(),
    ),
  );

  const rail = Rail.load(getRailEntityId(railId));
  if (rail) mockInBlockStore("Rail", rail.id.toHexString(), rail);
}

export function setupDataSet(
  dataSetId: GraphBN,
  pdpRailId: GraphBN,
  cacheMissRailId: GraphBN = GraphBN.zero(),
  cdnRailId: GraphBN = GraphBN.zero(),
  payer: Address = TEST_ADDRESSES.PAYER,
  serviceProvider: Address = TEST_ADDRESSES.SERVICE_PROVIDER,
): void {
  setupRail(pdpRailId, payer);
  if (!cacheMissRailId.isZero()) setupRail(cacheMissRailId, payer);
  if (!cdnRailId.isZero()) setupRail(cdnRailId, payer);

  handleDataSetCreated(
    createDataSetCreatedEvent(
      dataSetId,
      GraphBN.fromI32(1),
      pdpRailId,
      cacheMissRailId,
      cdnRailId,
      payer,
      serviceProvider,
      TEST_ADDRESSES.PAYEE,
    ),
  );
}
