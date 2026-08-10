import { AppContextProvider } from './context/AppContext';
import { AppShell } from './layout/AppShell';

function App() {
  return (
    <AppContextProvider>
      <AppShell />
    </AppContextProvider>
  );
}

export default App;
