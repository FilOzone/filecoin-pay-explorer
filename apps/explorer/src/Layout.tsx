import { Footer, Header } from "./components/shared";

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen flex flex-col'>
      <Header />
      <div className='max-w-screen-2xl mx-auto w-full h-full flex-1'>{children}</div>
      <Footer />
    </div>
  );
}

export default Layout;
