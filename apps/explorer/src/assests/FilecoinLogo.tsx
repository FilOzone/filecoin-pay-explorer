import Image from "next/image";

const FilecoinLogo = ({ className }: { className?: string }) => (
  <Image src='/filecoin-logo.svg' alt='Filecoin Logo' className={className} width={16} height={16} />
);

export default FilecoinLogo;
