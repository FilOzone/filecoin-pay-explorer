import { log, store } from "@graphprotocol/graph-ts";
import {
  DataSetDeleted as DataSetDeletedEvent,
  PiecesRemoved as PiecesRemovedEvent,
} from "../generated/PDPVerifier/PDPVerifier";
import { DataSet, Piece } from "../generated/schema";
import { getDataSetEntityId, getPieceEntityId } from "./utils/keys";
import { ZERO_BIG_INT } from "./utils/metrics/constants";

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
  dataSet.save();
}

export function handleDataSetDeleted(event: DataSetDeletedEvent): void {
  const dataSet = DataSet.load(getDataSetEntityId(event.params.setId));
  if (!dataSet) return; // not an FWSS-tracked dataset, or predates our start block

  // PDPVerifier deletes without emitting PiecesRemoved, so drop the pieces here too.
  const pieces = dataSet.pieces.load();
  for (let i = 0; i < pieces.length; i++) {
    store.remove("Piece", pieces[i].id.toHexString());
  }

  dataSet.status = "DELETED";
  dataSet.totalSize = ZERO_BIG_INT;
  dataSet.save();
}
