import React from 'react';
import { Settings } from '../types.ts';

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

  const inputClasses = "mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500";

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">Configurações do Estacionamento</h2>
      <form className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Pricing */}
          <div className="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Precificação</h3>
            <div>
              <label htmlFor="hourlyRate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor da Hora (R$)</label>
              <input type="number" name="hourlyRate" id="hourlyRate" value={settings.hourlyRate} onChange={handleChange} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="fractionRate" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor da Fração (R$)</label>
              <input type="number" name="fractionRate" id="fractionRate" value={settings.fractionRate} onChange={handleChange} className={inputClasses} />
            </div>
          </div>
          <div className="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">Regras de Tempo</h3>
            <div>
              <label htmlFor="toleranceMinutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Minutos de Tolerância</label>
              <input type="number" name="toleranceMinutes" id="toleranceMinutes" value={settings.toleranceMinutes} onChange={handleChange} className={inputClasses} />
            </div>
            <div>
              <label htmlFor="fractionLimitMinutes" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Limite da Fração (Minutos)</label>
              <input type="number" name="fractionLimitMinutes" id="fractionLimitMinutes" value={settings.fractionLimitMinutes} onChange={handleChange} className={inputClasses} />
            </div>
          </div>
        </div>

        {/* PIX Settings */}
        <div className="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
          <h3 className="font-semibold text-slate-700 dark:text-slate-200">Configurações PIX</h3>
          <div>
            <label htmlFor="pixKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Chave PIX</label>
            <input type="text" name="pixKey" id="pixKey" value={settings.pixKey} onChange={handleChange} className={inputClasses} />
          </div>
          <div>
            <label htmlFor="pixHolderName" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome do Titular</label>
            <input type="text" name="pixHolderName" id="pixHolderName" value={settings.pixHolderName} onChange={handleChange} className={inputClasses} />
          </div>
          <div>
            <label htmlFor="pixHolderCity" className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cidade do Titular</label>
            <input type="text" name="pixHolderCity" id="pixHolderCity" value={settings.pixHolderCity} onChange={handleChange} className={inputClasses} />
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center">As alterações são salvas automaticamente.</p>
      </form>
    </div>
  );
};

export default AdminArea;