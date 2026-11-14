import type { ComponentProps } from "react";
import { useAddressName } from "@/hooks/useAddressName";
import useNetwork from "@/hooks/useNetwork";
import CopyableText from "./CopyableText";
import OnchainNameMarker, { ONCHAIN_NAME_LABEL } from "./OnchainNameMarker";

type ServiceAddressProps = Omit<ComponentProps<typeof CopyableText>, "title" | "children" | "lookupName">;

/** An operator or validator address, named by the curated list or the contract's onchain metadata. */
const ServiceAddress = (props: ServiceAddressProps) => {
  const { network: contextNetwork } = useNetwork();
  const network = props.networkOverride ?? contextNetwork;
  const { name, description } = useAddressName(props.value, network);
  const onchain = name?.source === "onchain";
  const title = [onchain && `${ONCHAIN_NAME_LABEL}: ${name.name}`, description, props.value].filter(Boolean).join("\n");

  return (
    <CopyableText {...props} networkOverride={network} lookupName={false} title={title}>
      {onchain ? (
        <>
          {/* Up to 256 chars of contract text; the tooltip carries the full name. */}
          <span className='inline-block max-w-64 truncate align-bottom'>{name.name}</span>
          <OnchainNameMarker />
        </>
      ) : (
        name?.name
      )}
    </CopyableText>
  );
};

export default ServiceAddress;
