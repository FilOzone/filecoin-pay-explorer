import { Footer } from "@filecoin-pay/ui/components/footer";
import { Header } from "@filecoin-pay/ui/components/header";
import { ThemeProvider } from "@filecoin-pay/ui/components/theme-provider";

function App() {
  return (
    <ThemeProvider defaultTheme='system' storageKey='vite-ui-theme'>
      <div className='min-h-screen flex flex-col'>
        <Header />
        <main className='container mx-auto flex-1 px-3 sm:px-4 py-6'>
          <h1 className='text-2xl font-semibold'>Filecoin Pay Explorer</h1>
        </main>
        <Footer />
      </div>
    </ThemeProvider>
  );
}

export default App;
