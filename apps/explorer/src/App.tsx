import { Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import Accounts from "./pages/Accounts";
import Home from "./pages/Home";
import Operators from "./pages/Operators";
import Rails from "./pages/Rails";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/rails' element={<Rails />} />
        <Route path='/accounts' element={<Accounts />} />
        <Route path='/operators' element={<Operators />} />
      </Routes>
    </Layout>
  );
}

export default App;
