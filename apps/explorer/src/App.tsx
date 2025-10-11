import { Route, Routes } from "react-router-dom";
import Layout from "./Layout";
import AccountDetail from "./pages/AccountDetail";
import Accounts from "./pages/Accounts";
import Home from "./pages/Home";
import OperatorDetail from "./pages/OperatorDetail";
import Operators from "./pages/Operators";
import RailDetail from "./pages/RailDetail";
import Rails from "./pages/Rails";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path='/' element={<Home />} />
        <Route path='/rails' element={<Rails />} />
        <Route path='/rail/:railId' element={<RailDetail />} />
        <Route path='/accounts' element={<Accounts />} />
        <Route path='/account/:address' element={<AccountDetail />} />
        <Route path='/operators' element={<Operators />} />
        <Route path='/operator/:address' element={<OperatorDetail />} />
      </Routes>
    </Layout>
  );
}

export default App;
