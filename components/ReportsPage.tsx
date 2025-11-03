import React, { useMemo, useState } from 'react';
import { Vehicle, VehicleStatus, PaymentMethod } from '../types.ts';

interface ReportsPageProps {
  vehicles: Vehicle[];
}

type FilterPeriod = 'today' | '7days' | '15days' | '30days';

const ReportsPage: React.FC<ReportsPageProps> = ({ vehicles }) => {
  const [activeFilter, setActiveFilter] = useState<FilterPeriod>('today');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | 'all'>('all');

  const {
    totalRevenue,
    filteredVehicles,
    revenueByMethod,
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
    
    return {
      totalRevenue,
      filteredVehicles: filtered,
      revenueByMethod,
      title,
    };
  }, [vehicles, activeFilter]);
  
  const { vehiclesToDisplay, displayedTotal } = useMemo(() => {
    const vehiclesToDisplay =
      paymentMethodFilter === 'all'
        ? filteredVehicles
        : filteredVehicles.filter(v => v.paymentMethod === paymentMethodFilter);

    const displayedTotal =
      paymentMethodFilter === 'all'
        ? totalRevenue
        : revenueByMethod[paymentMethodFilter] || 0;
    
    return { vehiclesToDisplay, displayedTotal };

  }, [filteredVehicles, paymentMethodFilter, totalRevenue, revenueByMethod]);

  const paymentMethodLabels: Record<PaymentMethod | 'all', string> = {
    [PaymentMethod.PIX]: 'PIX',
    [PaymentMethod.CASH]: 'Dinheiro',
    [PaymentMethod.CARD]: 'Cartão',
    [PaymentMethod.CONVENIO]: 'Convênio',
    'all': 'Todos'
  };

  const compactDateTime = (isoString: string | undefined) => {
    if (!isoString) return '...';
    return new Date(isoString).toLocaleString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  }

  const PeriodFilterButton: React.FC<{ period: FilterPeriod; label: string }> = ({ period, label }) => (
    <button
      onClick={() => {
        setActiveFilter(period);
        setPaymentMethodFilter('all'); // Reseta o filtro de pagamento ao mudar o período
      }}
      className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
        activeFilter === period
          ? 'bg-blue-600 text-white shadow-sm dark:bg-slate-600'
          : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  const PaymentFilterButton: React.FC<{ method: PaymentMethod | 'all'; label: string }> = ({ method, label }) => (
    <button
      onClick={() => setPaymentMethodFilter(method)}
      className={`px-3 py-1 text-xs sm:text-sm font-semibold rounded-full transition-colors flex-shrink-0 ${
        paymentMethodFilter === method
          ? 'bg-blue-600 text-white shadow-sm'
          : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        <div className="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-lg">
            <PeriodFilterButton period="today" label="Hoje" />
            <PeriodFilterButton period="7days" label="7 Dias" />
            <PeriodFilterButton period="15days" label="15 Dias" />
            <PeriodFilterButton period="30days" label="30 Dias" />
        </div>
      </div>
      
      {/* Stats Card */}
      <div className="mb-6">
        <StatCard title="Total Arrecadado no Período" value={`R$ ${totalRevenue.toFixed(2).replace('.', ',')}`} />
      </div>

      {/* Exited Vehicles List */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Saídas Registradas no Período</h3>
        
        <div className="mb-4 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg">
          <div className="flex flex-nowrap items-center gap-2 mb-3 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <PaymentFilterButton method="all" label="Todos" />
              <PaymentFilterButton method={PaymentMethod.PIX} label="PIX" />
              <PaymentFilterButton method={PaymentMethod.CASH} label="Dinheiro" />
              <PaymentFilterButton method={PaymentMethod.CARD} label="Cartão" />
              <PaymentFilterButton method={PaymentMethod.CONVENIO} label="Convênio" />
          </div>
          <div className="text-right border-t dark:border-slate-700 pt-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total ({paymentMethodLabels[paymentMethodFilter]}): </span>
              <span className="text-lg font-bold text-slate-800 dark:text-slate-100">R$ {displayedTotal.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div className="space-y-4">
          {vehiclesToDisplay.length > 0 ? vehiclesToDisplay.slice().reverse().map(v => {
            let durationString = 'N/A';
            if (v.exitTime) {
              const entry = new Date(v.entryTime);
              const exit = new Date(v.exitTime);
              const durationMs = exit.getTime() - entry.getTime();
              const totalMinutes = Math.max(1, Math.ceil(durationMs / 60000));
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              durationString = `${hours}h ${minutes}m`;
            }

            return (
              <div key={v.id} className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
                {/* Linha 1: Placa, Marca, Cor, Valor */}
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">{v.plate}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{v.brand} - {v.color}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                      R$ {v.amountPaid?.toFixed(2).replace('.', ',')}
                    </p>
                    <span className="text-xs font-semibold capitalize bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">{v.paymentMethod ? paymentMethodLabels[v.paymentMethod] : '-'}</span>
                  </div>
                </div>

                {/* Linha 2 e 3: Entrada, Saída, Permanência */}
                <div className="grid grid-cols-3 gap-2 text-center text-sm border-t dark:border-slate-600 pt-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Entrada</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{compactDateTime(v.entryTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Saída</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{compactDateTime(v.exitTime)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Permanência</p>
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{durationString}</p>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="text-center py-10 text-slate-500 dark:text-slate-400">
              <p>Nenhuma saída registrada para o filtro selecionado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{title}</p>
    <p className="text-3xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
  </div>
);

export default ReportsPage;