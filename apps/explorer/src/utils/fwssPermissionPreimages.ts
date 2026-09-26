/**
 * EIP-712 type strings of the FWSS operations a session key can be scoped to, from filecoin-services
 * v1.3.0 `SignatureVerificationLib.sol`. A SessionKeyRegistry permission is keccak256 of one of these.
 */
export const FWSS_PERMISSION_PREIMAGES = {
  createDataSet:
    "CreateDataSet(uint256 clientDataSetId,address payee,MetadataEntry[] metadata)MetadataEntry(string key,string value)",
  addPieces:
    "AddPieces(uint256 clientDataSetId,uint256 nonce,Cid[] pieceData,PieceMetadata[] pieceMetadata)" +
    "Cid(bytes data)" +
    "MetadataEntry(string key,string value)" +
    "PieceMetadata(uint256 pieceIndex,MetadataEntry[] metadata)",
  schedulePieceRemovals: "SchedulePieceRemovals(uint256 clientDataSetId,uint256[] pieceIds)",
  terminateService: "TerminateService(uint256 dataSetId)",
} as const;
