import React, { useState, createContext, useContext, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import OperationalArea from './components/OperationalArea.tsx';
import AdminArea from './components/AdminArea.tsx';
import ReportsPage from './components/ReportsPage.tsx';
import useLocalStorage from './hooks/useLocalStorage.ts';
import { Vehicle, Settings, VehicleStatus, PaymentMethod } from './types.ts';
import { SunIcon, MoonIcon, CarIcon } from './components/Icons.tsx';
import { db } from './firebase.ts';

// --- INÍCIO DA LÓGICA DO TEMA (MOVIDA DE hooks/useTheme.tsx) ---
type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const CustomThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useLocalStorage<Theme>('theme', 'light');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
// --- FIM DA LÓGICA DO TEMA ---


// Default initial settings
const INITIAL_SETTINGS: Settings = {
  hourlyRate: 10,
  toleranceMinutes: 5,
  fractionRate: 5,
  fractionLimitMinutes: 15,
  pixKey: 'seu-pix@email.com',
  pixHolderName: 'NOME DO TITULAR',
  pixHolderCity: 'CIDADE',
};

type View = 'operational' | 'reports' | 'admin';

const AppUI: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [currentView, setCurrentView] = useState<View>('operational');
  const { theme, toggleTheme } = useTheme();

  // Effect to sync with Firebase
  useEffect(() => {
    // Sync vehicles
    const vehiclesRef = db.ref('vehicles');
    const onVehiclesValueChange = (snapshot: any) => {
      const data = snapshot.val();
      setVehicles(Array.isArray(data) ? data : []);
    };
    vehiclesRef.on('value', onVehiclesValueChange);

    // Sync settings
    const settingsRef = db.ref('settings');
    const onSettingsValueChange = (snapshot: any) => {
        const data = snapshot.val();
        if (data) {
            setSettings(data);
        } else {
            // If no settings in DB, initialize with defaults
            settingsRef.set(INITIAL_SETTINGS);
        }
    };
    settingsRef.on('value', onSettingsValueChange);

    // Cleanup listeners on component unmount
    return () => {
        vehiclesRef.off('value', onVehiclesValueChange);
        settingsRef.off('value', onSettingsValueChange);
    };
  }, []);

  const handleAddVehicle = (vehicleData: Omit<Vehicle, 'id' | 'entryTime' | 'status'>) => {
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: uuidv4(),
      entryTime: new Date().toISOString(),
      status: VehicleStatus.PARKED,
    };
    db.ref('vehicles').set([...vehicles, newVehicle]);
  };

  const handleCompleteExit = (id: string, amountPaid: number, paymentMethod: PaymentMethod) => {
    const updatedVehicles = vehicles.map(v =>
      v.id === id
        ? {
            ...v,
            status: VehicleStatus.PAID,
            exitTime: new Date().toISOString(),
            amountPaid,
            paymentMethod,
          }
        : v
    );
    db.ref('vehicles').set(updatedVehicles);
  };

  const handleSettingsChange = (newSettings: Settings) => {
    db.ref('settings').set(newSettings);
  };
  
  const NavButton: React.FC<{ view: View; label: string }> = ({ view, label }) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors ${
        currentView === view
          ? 'bg-blue-600 text-white shadow dark:bg-slate-600'
          : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen font-sans bg-slate-100 dark:bg-slate-900">
      <header className="bg-white shadow-md dark:bg-slate-900 dark:border-b dark:border-slate-700">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center gap-3 mb-4 sm:mb-0">
            <CarIcon className="h-8 w-8 text-blue-600 dark:text-slate-200" />
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Pare Aqui!!</h1>
          </div>
          <div className="flex items-center gap-4">
            <nav className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-lg">
              <NavButton view="operational" label="Operacional" />
              <NavButton view="reports" label="Relatórios" />
              <NavButton view="admin" label="Configurações" />
            </nav>
            <button
                onClick={toggleTheme}
                className="p-2 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
                aria-label="Toggle theme"
            >
                {theme === 'light' ? <MoonIcon className="h-6 w-6" /> : <SunIcon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>
      <main className="container mx-auto p-4 sm:p-8 dark:bg-slate-900">
        {currentView === 'operational' && (
          <OperationalArea
            vehicles={vehicles}
            settings={settings}
            onAddVehicle={handleAddVehicle}
            onCompleteExit={handleCompleteExit}
          />
        )}
        {currentView === 'reports' && <ReportsPage vehicles={vehicles} />}
        {currentView === 'admin' && (
          <AdminArea settings={settings} onSettingsChange={handleSettingsChange} />
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <CustomThemeProvider>
      <AppUI />
    </CustomThemeProvider>
  );
};

export default App;