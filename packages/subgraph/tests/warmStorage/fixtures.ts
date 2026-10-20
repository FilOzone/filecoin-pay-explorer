import { Address, BigInt as GraphBN } from "@graphprotocol/graph-ts";
import { mockInBlockStore } from "matchstick-as";
import { Rail } from "../../generated/schema";
import { getRailEntityId } from "../../src/utils/keys";
import { handleDataSetCreated } from "../../src/warmStorage";
import { setupRail, TEST_ADDRESSES } from "../payments/fixtures";
import { createDataSetCreatedEvent } from "./events";

export const SERVICE_PROVIDER = Address.fromString("0x0000000000000000000000000000000000000007");
export const APPROVER = Address.fromString("0x0000000000000000000000000000000000000008");

// FWSS creates each dataset's payment rails on the Payments contract before emitting
// DataSetCreated, so tests seed the Rail entities the same way: via a real RailCreated event.
// handleDataSetCreated reads the rail with loadInBlock, which Matchstick only resolves
// against this explicit in-block mock, not the regular store.
function setupInBlockRail(railId: GraphBN): void {
  setupRail(railId, GraphBN.zero());
  const rail = Rail.load(getRailEntityId(railId));
  if (rail) mockInBlockStore("Rail", rail.id.toHexString(), rail);
}

export function setupDataSet(
  dataSetId: GraphBN,
  pdpRailId: GraphBN,
  cacheMissRailId: GraphBN = GraphBN.zero(),
  cdnRailId: GraphBN = GraphBN.zero(),
): void {
  setupInBlockRail(pdpRailId);
  if (!cacheMissRailId.isZero()) setupInBlockRail(cacheMissRailId);
  if (!cdnRailId.isZero()) setupInBlockRail(cdnRailId);

  handleDataSetCreated(
    createDataSetCreatedEvent(
      dataSetId,
      GraphBN.fromI32(1),
      pdpRailId,
      cacheMissRailId,
      cdnRailId,
      TEST_ADDRESSES.ACCOUNT,
      SERVICE_PROVIDER,
      TEST_ADDRESSES.PAYEE,
    ),
  );
}
