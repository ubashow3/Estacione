import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleStatus, PaymentMethod } from '../types';

interface ReportsPageProps {
  vehicles: Vehicle[];
}

type FilterPeriod = 'today' | '7days' | '15days' | '30days';

const ReportsPage: React.FC<ReportsPageProps> = ({ vehicles }) => {
  const [activeFilter, setActiveFilter] = useState<FilterPeriod>('today');

  const {
    totalRevenue,
    filteredVehicles,
    revenueByMethod,
    averageStay,
    title,
  } = useMemo(() => {
    const now = new Date();
    const startDate = new Date();

    let title = 'Relatório do Dia';

    switch (activeFilter) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        title = `Relatório do Dia - ${now.toLocaleDateString('pt-BR')}`;
        break;
      case '7days':
        startDate.setDate(now.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        title = 'Relatório - Últimos 7 Dias';
        break;
      case '15days':
        startDate.setDate(now.getDate() - 15);
        startDate.setHours(0, 0, 0, 0);
        title = 'Relatório - Últimos 15 Dias';
        break;
      case '30days':
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        title = 'Relatório - Últimos 30 Dias';
        break;
    }

    const filtered = vehicles.filter(v => 
      v.status === VehicleStatus.PAID &&
      v.exitTime &&
      new Date(v.exitTime) >= startDate
    );

    const totalRevenue = filtered.reduce((acc, v) => acc + (v.amountPaid || 0), 0);
    
    const revenueByMethod = filtered.reduce((acc, v) => {
      if (v.paymentMethod) {
        acc[v.paymentMethod] = (acc[v.paymentMethod] || 0) + (v.amountPaid || 0);
      }
      return acc;
    }, {} as Record<PaymentMethod, number>);

    const totalStayMinutes = filtered.reduce((acc, v) => {
        if (v.exitTime) {
            const duration = new Date(v.exitTime).getTime() - new Date(v.entryTime).getTime();
            return acc + (duration / 60000);
        }
        return acc;
    }, 0);
    
    const avgMinutes = filtered.length > 0 ? totalStayMinutes / filtered.length : 0;
    const avgHours = Math.floor(avgMinutes / 60);
    const avgMins = Math.round(avgMinutes % 60);
    const averageStay = `${avgHours}h ${avgMins}m`;
    
    return {
      totalRevenue,
      filteredVehicles: filtered,
      revenueByMethod,
      averageStay,
      title,
    };
  }, [vehicles, activeFilter]);

  const paymentMethodLabels: Record<PaymentMethod, string> = {
    [PaymentMethod.PIX]: 'PIX',
    [PaymentMethod.CASH]: 'Dinheiro',
    [PaymentMethod.CARD]: 'Cartão',
    [PaymentMethod.CONVENIO]: 'Convênio',
  };

  const FilterButton: React.FC<{ period: FilterPeriod; label: string }> = ({ period, label }) => (
    <button
      onClick={() => setActiveFilter(period)}
      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
        activeFilter === period
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-white text-slate-600 hover:bg-slate-100 border'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800">{title}</h2>
        <div className="flex items-center space-x-2 p-1 bg-slate-100 rounded-lg">
            <FilterButton period="today" label="Hoje" />
            <FilterButton period="7days" label="7 Dias" />
            <FilterButton period="15days" label="15 Dias" />
            <FilterButton period="30days" label="30 Dias" />
        </div>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Total Arrecadado" value={`R$ ${totalRevenue.toFixed(2).replace('.', ',')}`} />
        <StatCard title="Veículos (Saída)" value={filteredVehicles.length.toString()} />
        <StatCard title="Permanência Média" value={averageStay} />
        <StatCard title="PIX" value={`R$ ${(revenueByMethod.pix || 0).toFixed(2).replace('.', ',')}`} />
      </div>

      {/* Exited Vehicles List */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold text-slate-800 mb-4">Saídas Registradas no Período</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-100">
              <tr>
                <th scope="col" className="px-6 py-3">Placa</th>
                <th scope="col" className="px-6 py-3">Entrada</th>
                <th scope="col" className="px-6 py-3">Saída</th>
                <th scope="col" className="px-6 py-3">Valor Pago</th>
                <th scope="col" className="px-6 py-3">Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length > 0 ? filteredVehicles.slice().reverse().map(v => (
                <tr key={v.id} className="bg-white border-b hover:bg-slate-50">
                  <td className="px-6 py-4 font-mono font-semibold text-slate-900">{v.plate}</td>
                  <td className="px-6 py-4">{new Date(v.entryTime).toLocaleString('pt-BR')}</td>
                  <td className="px-6 py-4">{v.exitTime ? new Date(v.exitTime).toLocaleString('pt-BR') : '-'}</td>
                  <td className="px-6 py-4">R$ {v.amountPaid?.toFixed(2).replace('.', ',')}</td>
                  <td className="px-6 py-4 capitalize">{v.paymentMethod ? paymentMethodLabels[v.paymentMethod] : '-'}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-slate-500">Nenhuma saída registrada no período selecionado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
    <p className="text-3xl font-bold text-slate-800">{value}</p>
  </div>
);

export default ReportsPage;