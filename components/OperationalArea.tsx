
import React, { useState, useMemo } from 'react';
import { Vehicle, Settings, VehicleStatus, PaymentMethod } from '../types.ts';
import { CameraIcon, ExitIcon } from './Icons.tsx';
import PlateScannerModal from './PlateScannerModal.tsx';
import VehicleExitPage from './VehicleExitModal.tsx';

interface OperationalAreaProps {
  vehicles: Vehicle[];
  settings: Settings;
  onAddVehicle: (vehicle: Omit<Vehicle, 'id' | 'entryTime' | 'status'>) => void;
  onCompleteExit: (id: string, amountPaid: number, paymentMethod: PaymentMethod) => void;
}

const CAR_BRANDS = ["Outra", "VW", "Fiat", "Chevrolet", "Hyundai", "Ford", "Toyota", "Honda", "Jeep", "Renault"];
const CAR_COLORS = ["Outra", "Prata", "Preto", "Branco", "Cinza", "Vermelho", "Azul", "Marrom"];

// Vehicle Entry Form Component
const VehicleEntryForm: React.FC<{ onAddVehicle: OperationalAreaProps['onAddVehicle'] }> = ({ onAddVehicle }) => {
  const [plate, setPlate] = useState('');
  const [brand, setBrand] = useState(CAR_BRANDS[0]);
  const [color, setColor] = useState(CAR_COLORS[0]);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (plate.trim()) {
      onAddVehicle({ plate: plate.toUpperCase(), brand, color });
      setPlate('');
      setBrand(CAR_BRANDS[0]);
      setColor(CAR_COLORS[0]);
    }
  };

  const handlePlateScanned = (scannedPlate: string) => {
    setPlate(scannedPlate);
    setIsScannerOpen(false);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label htmlFor="plate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Placa do Veículo</label>
          <input
            type="text"
            id="plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            className="mt-1 block w-full px-3 py-2 pr-12 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-slate-500 dark:focus:border-slate-500"
            placeholder="AAA-1234"
            required
          />
          <button 
            type="button" 
            onClick={() => setIsScannerOpen(true)} 
            className="absolute inset-y-0 right-0 top-6 flex items-center px-3 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-slate-300"
            aria-label="Escanear placa"
          >
            <CameraIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="brand" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Marca</label>
            <select
              id="brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500"
            >
              {CAR_BRANDS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="color" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</label>
            <select
              id="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500"
            >
              {CAR_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors dark:bg-slate-600 dark:hover:bg-slate-500">
          Registrar Entrada
        </button>
      </form>
      <PlateScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onPlateScanned={handlePlateScanned}
      />
    </>
  );
};

// Vehicle List Component
const VehicleList: React.FC<{ vehicles: Vehicle[]; onSelectVehicle: (id: string) => void }> = ({ vehicles, onSelectVehicle }) => (
    <div className="space-y-3">
        {vehicles.length > 0 ? (
            vehicles.map(v => (
                <div key={v.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
                    <div className="flex items-center gap-3 flex-1 min-w-[150px]">
                        <div className="flex-shrink-0 w-1.5 h-10 bg-blue-500 dark:bg-blue-600 rounded-full"></div>
                        <div>
                            <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">{v.plate}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{v.brand} - {v.color}</p>
                        </div>
                    </div>

                    <div className="text-sm text-center">
                        <p className="font-semibold text-slate-700 dark:text-slate-200">{new Date(v.entryTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Entrada</p>
                    </div>

                    <button 
                        onClick={() => onSelectVehicle(v.id)} 
                        className="p-3 rounded-full text-green-600 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-400 dark:hover:bg-green-900/80 transition-colors"
                        aria-label="Registrar Saída"
                    >
                        <ExitIcon className="h-6 w-6" />
                    </button>
                </div>
            ))
        ) : (
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">Pátio vazio.</p>
        )}
    </div>
);


const OperationalArea: React.FC<OperationalAreaProps> = ({ vehicles, settings, onAddVehicle, onCompleteExit }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  const parkedVehicles = useMemo(() => vehicles.filter(v => v.status === VehicleStatus.PARKED), [vehicles]);

  const filteredVehicles = useMemo(() =>
    parkedVehicles.filter(v =>
      v.plate.toUpperCase().includes(searchQuery.toUpperCase())
    ).slice().reverse(),
    [parkedVehicles, searchQuery]
  );
  
  const selectedVehicle = useMemo(() =>
    vehicles.find(v => v.id === selectedVehicleId),
    [vehicles, selectedVehicleId]
  );

  if (selectedVehicle) {
    return (
      <VehicleExitPage
        vehicle={selectedVehicle}
        settings={settings}
        onCompleteExit={onCompleteExit}
        onBack={() => setSelectedVehicleId(null)}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Entry Panel */}
      <div className="lg:col-span-1">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Registrar Entrada</h2>
          <VehicleEntryForm onAddVehicle={onAddVehicle} />
        </div>
      </div>

      {/* Patio Panel */}
      <div className="lg:col-span-2">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Veículos no Pátio ({parkedVehicles.length})</h2>
            <input
              type="text"
              placeholder="Buscar placa..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-slate-500 dark:focus:border-slate-500"
            />
          </div>
          <VehicleList vehicles={filteredVehicles} onSelectVehicle={setSelectedVehicleId} />
        </div>
      </div>
    </div>
  );
};

export default OperationalArea;
