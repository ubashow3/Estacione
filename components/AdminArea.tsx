import React from 'react';
import { Settings } from '../types';

interface AdminAreaProps {
  settings: Settings;
  onSettingsChange: (newSettings: Settings) => void;
}

const AdminArea: React.FC<AdminAreaProps> = ({ settings, onSettingsChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    onSettingsChange({
      ...settings,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    });
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-slate-800 mb-6">Configurações do Estacionamento</h2>
      <form className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pricing */}
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-slate-700">Precificação</h3>
            <div>
              <label htmlFor="hourlyRate" className="block text-sm font-medium text-slate-700">Valor da Hora (R$)</label>
              <input type="number" name="hourlyRate" id="hourlyRate" value={settings.hourlyRate} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
            </div>
            <div>
              <label htmlFor="fractionRate" className="block text-sm font-medium text-slate-700">Valor da Fração (R$)</label>
              <input type="number" name="fractionRate" id="fractionRate" value={settings.fractionRate} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
            </div>
          </div>
          <div className="space-y-4 p-4 border rounded-lg">
            <h3 className="font-semibold text-slate-700">Regras de Tempo</h3>
            <div>
              <label htmlFor="toleranceMinutes" className="block text-sm font-medium text-slate-700">Minutos de Tolerância</label>
              <input type="number" name="toleranceMinutes" id="toleranceMinutes" value={settings.toleranceMinutes} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
            </div>
            <div>
              <label htmlFor="fractionLimitMinutes" className="block text-sm font-medium text-slate-700">Limite da Fração (Minutos)</label>
              <input type="number" name="fractionLimitMinutes" id="fractionLimitMinutes" value={settings.fractionLimitMinutes} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
            </div>
          </div>
        </div>

        {/* PIX Settings */}
        <div className="space-y-4 p-4 border rounded-lg">
          <h3 className="font-semibold text-slate-700">Configurações PIX</h3>
          <div>
            <label htmlFor="pixKey" className="block text-sm font-medium text-slate-700">Chave PIX</label>
            <input type="text" name="pixKey" id="pixKey" value={settings.pixKey} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
          </div>
          <div>
            <label htmlFor="pixHolderName" className="block text-sm font-medium text-slate-700">Nome do Titular</label>
            <input type="text" name="pixHolderName" id="pixHolderName" value={settings.pixHolderName} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
          </div>
          <div>
            <label htmlFor="pixHolderCity" className="block text-sm font-medium text-slate-700">Cidade do Titular</label>
            <input type="text" name="pixHolderCity" id="pixHolderCity" value={settings.pixHolderCity} onChange={handleChange} className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm" />
          </div>
        </div>
        <p className="text-sm text-slate-500 text-center">As alterações são salvas automaticamente.</p>
      </form>
    </div>
  );
};

export default AdminArea;
