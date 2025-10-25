import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import OperationalArea from './components/OperationalArea';
import AdminArea from './components/AdminArea';
import ReportsPage from './components/ReportsPage';
import useLocalStorage from './hooks/useLocalStorage';
import { Vehicle, Settings, VehicleStatus, PaymentMethod } from './types';
import { useTheme } from './hooks/useTheme';
import { SunIcon, MoonIcon } from './components/Icons';

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

const App: React.FC = () => {
  const [vehicles, setVehicles] = useLocalStorage<Vehicle[]>('estacionamento_vehicles', []);
  const [settings, setSettings] = useLocalStorage<Settings>('estacionamento_settings', INITIAL_SETTINGS);
  const [currentView, setCurrentView] = useState<View>('operational');
  const { theme, toggleTheme } = useTheme();

  const handleAddVehicle = (vehicleData: Omit<Vehicle, 'id' | 'entryTime' | 'status'>) => {
    const newVehicle: Vehicle = {
      ...vehicleData,
      id: uuidv4(),
      entryTime: new Date().toISOString(),
      status: VehicleStatus.PARKED,
    };
    setVehicles(prev => [...prev, newVehicle]);
  };

  const handleCompleteExit = (id: string, amountPaid: number, paymentMethod: PaymentMethod) => {
    setVehicles(prev =>
      prev.map(v =>
        v.id === id
          ? {
              ...v,
              status: VehicleStatus.PAID,
              exitTime: new Date().toISOString(),
              amountPaid,
              paymentMethod,
            }
          : v
      )
    );
  };

  const handleSettingsChange = (newSettings: Settings) => {
    setSettings(newSettings);
  };
  
  const NavButton: React.FC<{ view: View; label: string }> = ({ view, label }) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors ${
        currentView === view
          ? 'bg-blue-600 text-white shadow'
          : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-600 dark:text-slate-200 dark:hover:bg-slate-500'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen font-sans">
      <header className="bg-white shadow-md dark:bg-slate-800 dark:border-b dark:border-slate-700">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4 sm:mb-0">estacionamento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-700 rounded-lg">
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
      <main className="container mx-auto p-4 sm:p-8">
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

export default App;