import { Alert } from "@filecoin-foundation/ui-filecoin/Alert";

export const BetaWarning = () => (
  <Alert
    title='Beta Version - Use with Caution'
    description='This console is currently in beta and interacts directly with smart contracts on the Filecoin network. Please use with caution and always verify transaction details before confirming.'
  />
);
