// Use lowercase, not checksummed addresses
export const knownAddresses: Record<string, string> = {
  "0x3c1ae7a70a2b51458fcb7927fd77aae408a1b857": "Storacha",
  "0x3e4e5f067cfda2f16aade21912b8324c3d9624f8": "Tippy",
  "0xd19d84c77bbb901971e460830e310933a210dbaa": "PinMe",
  "0xa5f90bc2aa73a2e0bad4d7092a932644d5dd5d71": "DealBot (legacy)",
  "0x305025d07c1dee47f25a4990179eff2becddca0b": "DealBot",
  "0x8408502033c418e1bbc97ce9ac48e5528f371a9f": "FWSS",
  "0x02925630df557f957f70e112ba06e50965417ca0": "Filecoin Warm Storage Service",
  "0xa53bbc04a0a2b7a7e62a78a24dd6c9280f611b97": "Qave",
  "0xf88c59cf5ba1e904079079c8ce03148490cb09f8": "Filosign",
  // FIL One (Filecoin Foundation's storage subsidiary) pays its storage vendor
  // over Filecoin Pay under a reserved-capacity MSA.
  // Operator: named service contract (implements IFilecoinServiceMetadata,
  // Sourcify-verified; name() returns "FIL One Storage").
  "0x9d4f07b948e87941a4bf4ab335d7a7d854843d75": "FIL One Storage",
  // Validator: clamps settlement to owner-signed delivery attestations.
  "0x4f9e434c5842d16f4f9ed92213ba4eb3a6ffc383": "FIL One Delivery Validator",
  // Payer: FIL One's operating wallet (payer on FIL One Storage rails).
  "0x5b27dbc6efefbb5ba8106fb19433048d60d6878f": "FIL One",
};
