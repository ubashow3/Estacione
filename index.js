import { db } from './firebase.js';

// --- STATE MANAGEMENT ---
let vehicles = [];
let settings = {};
let currentView = 'operational';
let selectedVehicleId = null;
let isScannerOpen = false;
let TESSERACT_WORKER = null;
let videoStream = null;


// --- DOM ELEMENTS ---
const mainContent = document.getElementById('main-content');
const modalContainer = document.getElementById('modal-container');
const themeToggle = document.getElementById('theme-toggle');
const themeIconMoon = document.getElementById('theme-icon-moon');
const themeIconSun = document.getElementById('theme-icon-sun');
const navButtons = document.querySelectorAll('.nav-button');
const htmlEl = document.documentElement;

// --- CONSTANTS ---
const INITIAL_SETTINGS = {
  hourlyRate: 10,
  toleranceMinutes: 5,
  fractionRate: 5,
  fractionLimitMinutes: 15,
  pixKey: 'seu-pix@email.com',
  pixHolderName: 'NOME DO TITULAR',
  pixHolderCity: 'CIDADE',
};
const CAR_BRANDS = ["Outra", "VW", "Fiat", "Chevrolet", "Hyundai", "Ford", "Toyota", "Honda", "Jeep", "Renault"];
const CAR_COLORS = ["Outra", "Prata", "Preto", "Branco", "Cinza", "Vermelho", "Azul", "Marrom"];

// --- TEMPLATES (HTML as strings) ---
const operationalViewTemplate = () => `
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div class="lg:col-span-1">
      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
        <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Registrar Entrada</h2>
        <form id="add-vehicle-form" class="space-y-4">
          <div class="relative">
            <label for="plate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Placa do Veículo</label>
            <input type="text" id="plate" name="plate" class="mt-1 block w-full px-3 py-2 pr-12 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-slate-500 dark:focus:border-slate-500" placeholder="AAA-1234" required>
            <button type="button" id="open-scanner-btn" class="absolute inset-y-0 right-0 top-6 flex items-center px-3 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-slate-300" aria-label="Escanear placa">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.776 48.776 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"></path></svg>
            </button>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="brand" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Marca</label>
              <select id="brand" name="brand" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
                ${CAR_BRANDS.map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div>
              <label for="color" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</label>
              <select id="color" name="color" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
                ${CAR_COLORS.map(c => `<option value="${c}">${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <button type="submit" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors dark:bg-slate-600 dark:hover:bg-slate-500">Registrar Entrada</button>
        </form>
      </div>
    </div>
    <div class="lg:col-span-2">
      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
        <div class="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
          <h2 id="patio-title" class="text-xl font-bold text-slate-800 dark:text-slate-100">Veículos no Pátio (0)</h2>
          <input type="text" id="search-plate" placeholder="Buscar placa..." class="w-full sm:w-auto px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:placeholder:text-slate-400 dark:focus:ring-slate-500 dark:focus:border-slate-500">
        </div>
        <div id="vehicle-list-container" class="space-y-3"></div>
      </div>
    </div>
  </div>`;

const vehicleListItemTemplate = (v) => `
  <div class="bg-slate-50 dark:bg-slate-800 p-3 rounded-lg shadow-sm border dark:border-slate-700 flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-3 flex-1 min-w-[150px]">
      <div class="flex-shrink-0 w-1.5 h-10 bg-blue-500 dark:bg-slate-600 rounded-full"></div>
      <div>
        <p class="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">${v.plate}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">${v.brand} - ${v.color}</p>
      </div>
    </div>
    <div class="text-sm text-center">
      <p class="font-semibold text-slate-700 dark:text-slate-200">${new Date(v.entryTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400">Entrada</p>
    </div>
    <button data-id="${v.id}" class="register-exit-btn p-3 rounded-full text-green-600 bg-green-100 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-400 dark:hover:bg-green-900/80 transition-colors" aria-label="Registrar Saída">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="h-6 w-6"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"></path></svg>
    </button>
  </div>`;
  
const adminViewTemplate = () => `
  <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md max-w-4xl mx-auto">
    <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6">Configurações do Estacionamento</h2>
    <form id="settings-form" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
          <h3 class="font-semibold text-slate-700 dark:text-slate-200">Precificação</h3>
          <div>
            <label for="hourlyRate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor da Hora (R$)</label>
            <input type="number" step="0.01" name="hourlyRate" id="hourlyRate" value="${settings.hourlyRate}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
          </div>
          <div>
            <label for="fractionRate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor da Fração (R$)</label>
            <input type="number" step="0.01" name="fractionRate" id="fractionRate" value="${settings.fractionRate}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
          </div>
        </div>
        <div class="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
          <h3 class="font-semibold text-slate-700 dark:text-slate-200">Regras de Tempo</h3>
          <div>
            <label for="toleranceMinutes" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Minutos de Tolerância</label>
            <input type="number" name="toleranceMinutes" id="toleranceMinutes" value="${settings.toleranceMinutes}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
          </div>
          <div>
            <label for="fractionLimitMinutes" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Limite da Fração (Minutos)</label>
            <input type="number" name="fractionLimitMinutes" id="fractionLimitMinutes" value="${settings.fractionLimitMinutes}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
          </div>
        </div>
      </div>
      <div class="space-y-4 p-4 border dark:border-slate-700 rounded-lg">
        <h3 class="font-semibold text-slate-700 dark:text-slate-200">Configurações PIX</h3>
        <div>
          <label for="pixKey" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Chave PIX</label>
          <input type="text" name="pixKey" id="pixKey" value="${settings.pixKey}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
        </div>
        <div>
          <label for="pixHolderName" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome do Titular</label>
          <input type="text" name="pixHolderName" id="pixHolderName" value="${settings.pixHolderName}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
        </div>
        <div>
          <label for="pixHolderCity" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Cidade do Titular</label>
          <input type="text" name="pixHolderCity" id="pixHolderCity" value="${settings.pixHolderCity}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
        </div>
      </div>
      <p class="text-sm text-slate-500 dark:text-slate-400 text-center">As alterações são salvas automaticamente.</p>
    </form>
  </div>`;
  
const reportsViewTemplate = (reportData) => {
    const { title, totalRevenue, vehiclesToDisplay, displayedTotal, paymentMethodFilter, activeFilter } = reportData;
    const paymentMethodLabels = { pix: 'PIX', cash: 'Dinheiro', card: 'Cartão', convenio: 'Convênio' };
    const compactDateTime = (isoString) => {
        if (!isoString) return '...';
        return new Date(isoString).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    };

    const periodFilters = [
        { period: 'today', label: 'Hoje' }, { period: '7days', label: '7 Dias' },
        { period: '15days', label: '15 Dias' }, { period: '30days', label: '30 Dias' },
    ];
    const paymentFilters = [
        { method: 'all', label: 'Todos' }, { method: 'pix', label: 'PIX' }, { method: 'cash', label: 'Dinheiro' },
        { method: 'card', label: 'Cartão' }, { method: 'convenio', label: 'Convênio' },
    ];

    return `
    <div class="space-y-8">
      <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100">${title}</h2>
        <div class="flex items-center space-x-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-lg">
          ${periodFilters.map(({period, label}) => `
            <button data-period="${period}" class="period-filter-btn px-4 py-2 text-sm font-semibold rounded-md transition-colors ${activeFilter === period ? 'bg-blue-600 text-white shadow-sm dark:bg-slate-600' : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'}">
              ${label}
            </button>
          `).join('')}
        </div>
      </div>
      
      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
        <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">Total Arrecadado no Período</p>
        <p class="text-3xl font-bold text-slate-800 dark:text-slate-100">R$ ${totalRevenue.toFixed(2).replace('.', ',')}</p>
      </div>

      <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-md">
        <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">Saídas Registradas no Período</h3>
        <div class="mb-4 p-3 bg-slate-100 dark:bg-slate-900 rounded-lg">
          <div class="flex flex-nowrap items-center gap-2 mb-3 overflow-x-auto no-scrollbar">
            ${paymentFilters.map(({method, label}) => `
                <button data-method="${method}" class="payment-filter-btn px-3 py-1 text-xs sm:text-sm font-semibold rounded-full transition-colors flex-shrink-0 ${paymentMethodFilter === method ? 'bg-blue-600 text-white shadow-sm dark:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}">
                    ${label}
                </button>
            `).join('')}
          </div>
          <div class="text-right border-t dark:border-slate-700 pt-2">
              <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Total (${paymentMethodFilter === 'all' ? 'Todos' : paymentMethodLabels[paymentMethodFilter]}): </span>
              <span class="text-lg font-bold text-slate-800 dark:text-slate-100">R$ ${displayedTotal.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>

        <div class="space-y-4">
          ${vehiclesToDisplay.length > 0 ? vehiclesToDisplay.slice().reverse().map(v => {
            let durationString = 'N/A';
            if (v.exitTime) {
              const durationMs = new Date(v.exitTime).getTime() - new Date(v.entryTime).getTime();
              const totalMinutes = Math.max(1, Math.ceil(durationMs / 60000));
              const hours = Math.floor(totalMinutes / 60);
              const minutes = totalMinutes % 60;
              durationString = `${hours}h ${minutes}m`;
            }
            return `
              <div class="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col gap-3">
                <div class="flex justify-between items-start">
                  <div>
                    <p class="font-mono text-lg font-bold text-slate-800 dark:text-slate-100">${v.plate}</p>
                    <p class="text-sm text-slate-500 dark:text-slate-400">${v.brand} - ${v.color}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-lg font-semibold text-green-600 dark:text-green-400">R$ ${v.amountPaid?.toFixed(2).replace('.', ',')}</p>
                    <span class="text-xs font-semibold capitalize bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-1 rounded-full">${v.paymentMethod ? paymentMethodLabels[v.paymentMethod] : '-'}</span>
                  </div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center text-sm border-t dark:border-slate-600 pt-3">
                  <div>
                    <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Entrada</p>
                    <p class="font-semibold text-slate-700 dark:text-slate-200">${compactDateTime(v.entryTime)}</p>
                  </div>
                  <div>
                    <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Saída</p>
                    <p class="font-semibold text-slate-700 dark:text-slate-200">${compactDateTime(v.exitTime)}</p>
                  </div>
                  <div>
                    <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Permanência</p>
                    <p class="font-semibold text-slate-700 dark:text-slate-200">${durationString}</p>
                  </div>
                </div>
              </div>
            `;
          }).join('') : `<div class="text-center py-10 text-slate-500 dark:text-slate-400"><p>Nenhuma saída registrada para o filtro selecionado.</p></div>`}
        </div>
      </div>
    </div>`;
};

const exitModalTemplate = (vehicle, calculation) => {
    const { total, durationMinutes, entry, exit, breakdown } = calculation;
    const durationHours = Math.floor(durationMinutes / 60);
    const durationMins = durationMinutes % 60;
    
    return `
    <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full p-6 space-y-6">
        <div class="flex justify-between items-start">
            <div>
                <h2 class="text-2xl font-bold text-slate-800 dark:text-slate-100">Registrar Saída</h2>
                <p class="font-mono text-lg font-bold text-slate-600 dark:text-slate-300">${vehicle.plate}</p>
            </div>
            <button id="close-modal-btn" class="p-1 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700">&times;</button>
        </div>

        <div class="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg grid grid-cols-2 sm:grid-cols-3 gap-4 text-center">
            <div>
                <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Entrada</p>
                <p class="font-semibold text-slate-700 dark:text-slate-200">${entry.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
            </div>
            <div>
                <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Saída</p>
                <p class="font-semibold text-slate-700 dark:text-slate-200">${exit.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</p>
            </div>
            <div class="col-span-2 sm:col-span-1">
                <p class="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Permanência</p>
                <p class="font-semibold text-slate-700 dark:text-slate-200">${durationHours}h ${durationMins}m</p>
            </div>
        </div>

        <div class="text-center">
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400">Total a Pagar</p>
            <p class="text-5xl font-bold text-slate-800 dark:text-slate-100">R$ ${total.toFixed(2).replace('.', ',')}</p>
            <p class="text-xs text-slate-400">${breakdown}</p>
        </div>

        <div id="payment-area" class="${total <= 0 ? 'hidden' : ''}">
            <p class="text-center font-semibold text-slate-700 dark:text-slate-300 mb-3">Forma de Pagamento</p>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <button data-method="pix" class="payment-method-btn flex-1 p-2 border-2 border-transparent rounded-lg text-slate-600 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">PIX</button>
                <button data-method="cash" class="payment-method-btn flex-1 p-2 border-2 border-transparent rounded-lg text-slate-600 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Dinheiro</button>
                <button data-method="card" class="payment-method-btn flex-1 p-2 border-2 border-transparent rounded-lg text-slate-600 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Cartão</button>
                <button data-method="convenio" class="payment-method-btn flex-1 p-2 border-2 border-transparent rounded-lg text-slate-600 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600">Convênio</button>
            </div>
            <div id="pix-qr-code-container" class="hidden flex flex-col items-center justify-center p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p class="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">Escaneie para pagar com PIX</p>
                <div id="pix-qr-code" class="bg-white p-2 rounded-md"></div>
            </div>
        </div>

        <button id="confirm-exit-btn" data-vehicle-id="${vehicle.id}" data-amount="${total}" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors dark:bg-slate-600 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed" ${total > 0 ? 'disabled' : ''}>
          ${total > 0 ? 'Selecione o Pagamento' : 'Confirmar Saída (Tolerância)'}
        </button>
    </div>
    `;
};

const scannerModalTemplate = () => `
  <div class="bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-lg w-full p-4 space-y-4">
    <div class="flex justify-between items-center">
      <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">Escanear Placa</h2>
      <button id="close-modal-btn" class="p-1 rounded-full text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700">&times;</button>
    </div>
    <div class="bg-black rounded-md overflow-hidden relative">
      <video id="scanner-video" class="w-full" playsinline></video>
      <div class="absolute inset-0 flex items-center justify-center p-4">
        <div class="w-full h-1/3 border-4 border-dashed border-white/50 rounded-lg"></div>
      </div>
    </div>
    <p id="scanner-status" class="text-center text-sm text-slate-500 dark:text-slate-400 h-5">Aponte a câmera para a placa do veículo.</p>
    <button id="capture-plate-btn" class="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg shadow-md hover:bg-blue-700 transition-colors dark:bg-slate-600 dark:hover:bg-slate-500">Capturar e Ler Placa</button>
  </div>
`;

// --- THEME ---
const applyTheme = (theme) => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
        htmlEl.classList.add('dark');
        themeIconMoon.classList.add('hidden');
        themeIconSun.classList.remove('hidden');
    } else {
        htmlEl.classList.remove('dark');
        themeIconMoon.classList.remove('hidden');
        themeIconSun.classList.add('hidden');
    }
};
const toggleTheme = () => {
    const currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
};

// --- MODAL & OVERLAY ---
const showModal = (content) => {
    modalContainer.innerHTML = content;
    modalContainer.classList.remove('hidden');
    document.getElementById('close-modal-btn')?.addEventListener('click', hideModal);
};
const hideModal = () => {
    modalContainer.innerHTML = '';
    modalContainer.classList.add('hidden');
    selectedVehicleId = null;
    isScannerOpen = false;
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
};

// --- RENDER FUNCTIONS ---
const renderVehicleList = () => {
    const container = document.getElementById('vehicle-list-container');
    const searchInput = document.getElementById('search-plate');
    const title = document.getElementById('patio-title');
    if (!container || !searchInput || !title) return;

    const parkedVehicles = vehicles.filter(v => v.status === 'parked');
    const query = searchInput.value.toUpperCase();
    const filtered = parkedVehicles.filter(v => v.plate.toUpperCase().includes(query));
    
    title.textContent = `Veículos no Pátio (${parkedVehicles.length})`;

    if (filtered.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400 py-8">Pátio vazio ou nenhum veículo encontrado.</p>`;
    } else {
        container.innerHTML = filtered.slice().reverse().map(vehicleListItemTemplate).join('');
    }
    
    document.querySelectorAll('.register-exit-btn').forEach(button => {
        button.addEventListener('click', (e) => handleOpenExitModal(e.currentTarget.dataset.id));
    });
};

const renderReports = () => {
    const activeFilter = mainContent.dataset.activeFilter || 'today';
    const paymentMethodFilter = mainContent.dataset.paymentMethodFilter || 'all';
    const now = new Date();
    const startDate = new Date();
    let title = 'Relatório do Dia';

    switch (activeFilter) {
      case 'today': startDate.setHours(0, 0, 0, 0); title = `Relatório - ${now.toLocaleDateString('pt-BR')}`; break;
      case '7days': startDate.setDate(now.getDate() - 7); startDate.setHours(0, 0, 0, 0); title = 'Relatório - Últimos 7 Dias'; break;
      case '15days': startDate.setDate(now.getDate() - 15); startDate.setHours(0, 0, 0, 0); title = 'Relatório - Últimos 15 Dias'; break;
      case '30days': startDate.setDate(now.getDate() - 30); startDate.setHours(0, 0, 0, 0); title = 'Relatório - Últimos 30 Dias'; break;
    }

    const periodVehicles = vehicles.filter(v => v.status === 'paid' && v.exitTime && new Date(v.exitTime) >= startDate);
    const totalRevenue = periodVehicles.reduce((acc, v) => acc + (v.amountPaid || 0), 0);
    const vehiclesToDisplay = paymentMethodFilter === 'all' ? periodVehicles : periodVehicles.filter(v => v.paymentMethod === paymentMethodFilter);
    const displayedTotal = vehiclesToDisplay.reduce((acc, v) => acc + (v.amountPaid || 0), 0);

    const reportData = { title, totalRevenue, vehiclesToDisplay, displayedTotal, paymentMethodFilter, activeFilter };
    mainContent.innerHTML = reportsViewTemplate(reportData);

    document.querySelectorAll('.period-filter-btn').forEach(btn => btn.addEventListener('click', e => {
        mainContent.dataset.activeFilter = e.currentTarget.dataset.period;
        mainContent.dataset.paymentMethodFilter = 'all';
        renderReports();
    }));
    document.querySelectorAll('.payment-filter-btn').forEach(btn => btn.addEventListener('click', e => {
        mainContent.dataset.paymentMethodFilter = e.currentTarget.dataset.method;
        renderReports();
    }));
};

const render = () => {
    hideModal(); // Ensure modals are closed on view change
    switch (currentView) {
        case 'operational':
            mainContent.innerHTML = operationalViewTemplate();
            renderVehicleList();
            document.getElementById('add-vehicle-form').addEventListener('submit', handleAddVehicle);
            document.getElementById('search-plate').addEventListener('input', renderVehicleList);
            document.getElementById('open-scanner-btn').addEventListener('click', handleOpenScanner);
            break;
        case 'reports':
            renderReports();
            break;
        case 'admin':
            mainContent.innerHTML = adminViewTemplate();
            document.getElementById('settings-form').addEventListener('input', handleSettingsChange);
            break;
    }
};

// --- LOGIC & EVENT HANDLERS ---
function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

const handleAddVehicle = (e) => {
    e.preventDefault();
    const form = e.target;
    const plateInput = form.plate;
    const plate = plateInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!plate) {
        alert("A placa é obrigatória.");
        return;
    }
    if (vehicles.some(v => v.plate === plate && v.status === 'parked')) {
        alert("Este veículo já está no pátio.");
        return;
    }

    const newVehicle = {
      plate,
      brand: form.brand.value,
      color: form.color.value,
      id: uuidv4(),
      entryTime: new Date().toISOString(),
      status: 'parked',
    };
    db.ref('vehicles').set([...vehicles, newVehicle]);
    form.reset();
    plateInput.focus();
};

const handleSettingsChange = (e) => {
    const { name, value, type } = e.target;
    const newSettings = {
        ...settings,
        [name]: type === 'number' ? parseFloat(value) || 0 : value,
    };
    db.ref('settings').set(newSettings);
};

const calculateFee = (vehicle) => {
    const entry = new Date(vehicle.entryTime);
    const exit = new Date();
    const durationMinutes = Math.max(0, (exit.getTime() - entry.getTime()) / 60000);

    if (durationMinutes <= settings.toleranceMinutes) {
        return { total: 0, durationMinutes: Math.round(durationMinutes), entry, exit, breakdown: 'Dentro da tolerância' };
    }

    const chargeableMinutes = Math.max(1, durationMinutes);
    const hours = Math.floor(chargeableMinutes / 60);
    const remainingMinutes = chargeableMinutes % 60;
    
    let total = hours * settings.hourlyRate;
    let breakdown = `${hours}h`;

    if (remainingMinutes > settings.fractionLimitMinutes) {
        total += settings.hourlyRate;
        breakdown += ` + 1h (fração > ${settings.fractionLimitMinutes}m)`;
    } else if (remainingMinutes > 0) {
        total += settings.fractionRate;
        breakdown += ` + 1 Fração (<= ${settings.fractionLimitMinutes}m)`;
    }

    if (total < settings.hourlyRate) {
        total = settings.hourlyRate; // Minimum charge is 1 hour
        breakdown = `Valor mínimo de 1h`;
    }

    return { total, durationMinutes: Math.round(durationMinutes), entry, exit, breakdown };
}

const handleOpenExitModal = (vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    selectedVehicleId = vehicleId;
    const calculation = calculateFee(vehicle);
    showModal(exitModalTemplate(vehicle, calculation));

    const confirmBtn = document.getElementById('confirm-exit-btn');
    let selectedMethod = null;

    if (calculation.total > 0) {
        document.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const method = e.target.dataset.method;
                selectedMethod = method;

                document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('bg-blue-600', 'text-white', 'dark:bg-blue-500', 'border-blue-500'));
                e.target.classList.add('bg-blue-600', 'text-white', 'dark:bg-blue-500', 'border-blue-500');
                
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirmar Saída';

                const pixContainer = document.getElementById('pix-qr-code-container');
                if (method === 'pix') {
                    const qrCodeEl = document.getElementById('pix-qr-code');
                    qrCodeEl.innerHTML = '';
                    new QRCode(qrCodeEl, {
                        text: generatePixPayload(calculation.total),
                        width: 150,
                        height: 150,
                    });
                    pixContainer.classList.remove('hidden');
                } else {
                    pixContainer.classList.add('hidden');
                }
            });
        });
    }

    confirmBtn.addEventListener('click', (e) => {
        const updatedVehicles = vehicles.map(v => {
            if (v.id === e.target.dataset.vehicleId) {
                return {
                    ...v,
                    status: 'paid',
                    exitTime: new Date().toISOString(),
                    amountPaid: parseFloat(e.target.dataset.amount),
                    paymentMethod: selectedMethod
                };
            }
            return v;
        });
        db.ref('vehicles').set(updatedVehicles);
        hideModal();
    });
};

const generatePixPayload = (amount) => {
    const format = (id, value) => {
        const len = value.length.toString().padStart(2, '0');
        return `${id}${len}${value}`;
    };
    const key = settings.pixKey || '';
    const name = (settings.pixHolderName || 'NOME').substring(0, 25);
    const city = (settings.pixHolderCity || 'CIDADE').substring(0, 15);
    const amountStr = amount.toFixed(2);
    
    let payload = '';
    payload += format('00', '01');
    payload += format('26', format('00', 'br.gov.bcb.pix') + format('01', key));
    payload += format('52', '0000');
    payload += format('53', '986');
    payload += format('54', amountStr);
    payload += format('58', 'BR');
    payload += format('59', name);
    payload += format('60', city);
    payload += format('62', format('05', '***'));
    payload += '6304'; // CRC16 placeholder start

    // Basic CRC16 calculation
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
        }
    }
    const crc16 = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    return payload + crc16;
};

const handleOpenScanner = async () => {
    isScannerOpen = true;
    showModal(scannerModalTemplate());
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');

    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = videoStream;
        video.play();
        document.getElementById('capture-plate-btn').addEventListener('click', () => recognizePlate(video, statusEl));
    } catch (err) {
        console.error("Error accessing camera: ", err);
        statusEl.textContent = 'Erro ao acessar a câmera.';
        statusEl.classList.add('text-red-500');
    }
};

const recognizePlate = async (video, statusEl) => {
    if (!TESSERACT_WORKER) {
        statusEl.textContent = 'Inicializando leitor...';
        TESSERACT_WORKER = await Tesseract.createWorker('eng', 1, {
            logger: m => console.log(m)
        });
        await TESSERACT_WORKER.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
        });
    }
    
    statusEl.textContent = 'Lendo placa...';
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const { data: { text } } = await TESSERACT_WORKER.recognize(canvas);
    const cleanedText = text.replace(/[^A-Z0-9]/g, '');
    
    // Basic validation for Mercosul (LLLNLNN) or traditional (LLLNNNN) plates
    const plateRegex = /[A-Z]{3}[0-9][A-Z0-9][0-9]{2}|[A-Z]{3}[0-9]{4}/;
    const match = cleanedText.match(plateRegex);

    if (match) {
        const foundPlate = match[0];
        document.getElementById('plate').value = foundPlate;
        statusEl.textContent = `Placa encontrada: ${foundPlate}`;
        hideModal();
    } else {
        statusEl.textContent = 'Nenhuma placa válida encontrada. Tente novamente.';
    }
};

const switchView = (view) => {
    currentView = view;
    navButtons.forEach(button => {
        const baseClasses = 'nav-button px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors';
        if (button.dataset.view === view) {
            button.className = `${baseClasses} bg-blue-600 text-white shadow dark:bg-slate-600`;
        } else {
            button.className = `${baseClasses} bg-white text-slate-600 hover:bg-slate-100 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-600`;
        }
    });
    render();
};

// --- INITIALIZATION ---
const init = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', toggleTheme);
    navButtons.forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    
    db.ref('vehicles').on('value', snapshot => {
        vehicles = snapshot.val() || [];
        if (currentView === 'operational') renderVehicleList();
        if (currentView === 'reports') renderReports();
    });
    db.ref('settings').on('value', snapshot => {
        settings = snapshot.val() || INITIAL_SETTINGS;
        if (!snapshot.val()) db.ref('settings').set(INITIAL_SETTINGS);
        if (currentView === 'admin') render();
    });
    switchView('operational');
};
init();
