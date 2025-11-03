import { db } from './firebase.js';

// --- STATE MANAGEMENT ---
let vehicles = [];
let settings = {};
let currentView = 'operational';
let selectedVehicleId = null;
let TESSERACT_WORKER = null;

// --- DOM ELEMENTS ---
const mainContent = document.getElementById('main-content');
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
  <div class="bg-white dark:bg-slate-800 p-3 rounded-lg shadow flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-3 flex-1 min-w-[150px]">
      <div class="flex-shrink-0 w-1.5 h-10 bg-blue-500 dark:bg-slate-500 rounded-full"></div>
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
            <input type="number" name="hourlyRate" id="hourlyRate" value="${settings.hourlyRate}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
          </div>
          <div>
            <label for="fractionRate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Valor da Fração (R$)</label>
            <input type="number" name="fractionRate" id="fractionRate" value="${settings.fractionRate}" class="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white dark:focus:ring-slate-500 dark:focus:border-slate-500">
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
    const paymentMethodLabels = { pix: 'PIX', cash: 'Dinheiro', card: 'Cartão', convenio: 'Convênio', all: 'Todos' };
    const compactDateTime = (isoString) => {
        if (!isoString) return '...';
        return new Date(isoString).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
    };

    const periodFilters = [
        { period: 'today', label: 'Hoje' },
        { period: '7days', label: '7 Dias' },
        { period: '15days', label: '15 Dias' },
        { period: '30days', label: '30 Dias' },
    ];
    const paymentFilters = [
        { method: 'all', label: 'Todos' },
        { method: 'pix', label: 'PIX' },
        { method: 'cash', label: 'Dinheiro' },
        { method: 'card', label: 'Cartão' },
        { method: 'convenio', label: 'Convênio' },
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
              <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Total (${paymentMethodLabels[paymentMethodFilter]}): </span>
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
    
    // Add event listeners after rendering
    document.querySelectorAll('.register-exit-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            selectedVehicleId = e.currentTarget.dataset.id;
            render();
        });
    });
};

const renderReports = () => {
    const activeFilter = mainContent.dataset.activeFilter || 'today';
    const paymentMethodFilter = mainContent.dataset.paymentMethodFilter || 'all';

    const now = new Date();
    const startDate = new Date();
    let title = 'Relatório do Dia';

    switch (activeFilter) {
      case 'today': startDate.setHours(0, 0, 0, 0); title = `Relatório do Dia - ${now.toLocaleDateString('pt-BR')}`; break;
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

    // Add event listeners
    document.querySelectorAll('.period-filter-btn').forEach(btn => btn.addEventListener('click', e => {
        mainContent.dataset.activeFilter = e.currentTarget.dataset.period;
        mainContent.dataset.paymentMethodFilter = 'all'; // Reset payment filter
        renderReports();
    }));
    document.querySelectorAll('.payment-filter-btn').forEach(btn => btn.addEventListener('click', e => {
        mainContent.dataset.paymentMethodFilter = e.currentTarget.dataset.method;
        renderReports();
    }));
};

const render = () => {
    if (selectedVehicleId) {
        // Render Exit Page
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        // For simplicity, we'll build the exit logic directly inside the main render function
        // A more complex app would use a dedicated function like renderExitPage(vehicle)
        mainContent.innerHTML = 'EXIT PAGE FOR ' + vehicle.plate; // Placeholder
        return;
    }
    
    switch (currentView) {
        case 'operational':
            mainContent.innerHTML = operationalViewTemplate();
            renderVehicleList();
            // Add event listeners for the operational view
            document.getElementById('add-vehicle-form').addEventListener('submit', handleAddVehicle);
            document.getElementById('search-plate').addEventListener('input', renderVehicleList);
            document.getElementById('open-scanner-btn').addEventListener('click', () => alert('Scanner a ser implementado'));
            break;
        case 'reports':
            renderReports();
            break;
        case 'admin':
            mainContent.innerHTML = adminViewTemplate();
            // Add event listeners for admin view
            document.getElementById('settings-form').addEventListener('input', handleSettingsChange);
            break;
    }
};

// --- EVENT HANDLERS & LOGIC ---

function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

const handleAddVehicle = (e) => {
    e.preventDefault();
    const form = e.target;
    const plate = form.plate.value.toUpperCase();
    if (!plate) return;

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
};

const handleSettingsChange = (e) => {
    const { name, value, type } = e.target;
    const newSettings = {
        ...settings,
        [name]: type === 'number' ? parseFloat(value) || 0 : value,
    };
    db.ref('settings').set(newSettings);
};

const switchView = (view) => {
    currentView = view;
    navButtons.forEach(button => {
        if (button.dataset.view === view) {
            button.className = 'nav-button px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors bg-blue-600 text-white shadow dark:bg-slate-600';
        } else {
            button.className = 'nav-button px-4 py-2 text-sm sm:text-base font-semibold rounded-md transition-colors bg-white text-slate-600 hover:bg-slate-100 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-600';
        }
    });
    render();
};

// --- INITIALIZATION ---
const init = () => {
    // Theme setup
    const savedTheme = localStorage.getItem('theme') || 'light';
    applyTheme(savedTheme);
    themeToggle.addEventListener('click', toggleTheme);

    // Nav setup
    navButtons.forEach(button => {
        button.addEventListener('click', () => switchView(button.dataset.view));
    });
    
    // Firebase Listeners
    db.ref('vehicles').on('value', snapshot => {
        vehicles = snapshot.val() || [];
        if (currentView === 'operational') renderVehicleList();
        if (currentView === 'reports') renderReports();
    });

    db.ref('settings').on('value', snapshot => {
        settings = snapshot.val() || INITIAL_SETTINGS;
        if (!snapshot.val()) {
            db.ref('settings').set(INITIAL_SETTINGS);
        }
        if (currentView === 'admin') render();
    });

    // Initial Render
    switchView('operational');
};

// Start the app
init();
