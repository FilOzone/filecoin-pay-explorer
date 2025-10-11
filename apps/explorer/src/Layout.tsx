import { Footer } from "@filecoin-pay/ui/components/footer";
import { Header } from "@filecoin-pay/ui/components/header";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen flex flex-col'>
      <Header />
      {children}
      <Footer />
    </div>
  );
}

export default Layout;
