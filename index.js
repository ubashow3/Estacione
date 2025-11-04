
import { db } from './firebase.js';
import { GoogleGenAI } from 'https://esm.run/@google/genai';

let state = {
    vehicles: [],
    settings: {
        hourlyRate: 10,
        toleranceMinutes: 5,
        fractionRate: 5,
        fractionLimitMinutes: 15,
        pixKey: "seu-pix@email.com",
        pixHolderName: "NOME DO TITULAR",
        pixHolderCity: "CIDADE",
        mercadoPagoAccessToken: "APP_USR-1148763024143595-110318-262df78fa85a3ca2e717d0861555220b-1866080078",
        useMercadoPago: false,
    },
    currentPage: 'operational', // operational, reports, admin, checkout-selection, checkout-pix, checkout-standard, checkout-success
    selectedVehicleId: null,
    paymentData: null,
    theme: localStorage.getItem('theme') || 'dark',
    paymentPollingInterval: null,
    reportsDateFilter: 'today', // today, 7days, 15days, 30days
    reportsPaymentFilter: 'todos', // todos, pix, dinheiro, cartao, convenio
    operationalSearchQuery: '',
    scannerTargetInputId: null,
};

// Hidden admin feature state
let headerClickCount = 0;
let headerClickTimer = null;

// Plate Scanner State
let videoStream = null;
let scanInterval = null;
let isScanning = false;


// --- HELPERS ---
const formatCurrency = (value) => value || value === 0 ? `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}` : 'R$ 0,00';
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const formatPermanence = (entryTime, exitTime) => {
    if (!entryTime || !exitTime) return 'N/A';
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    if (diffMs < 0) return 'N/A';
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const minutes = diffMins % 60;
    return `${hours}h ${minutes}m`;
};
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};
const applyTheme = () => {
    if (state.theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', state.theme);
}

// Helper para gerar o código do PIX (BRCode)
const generateBRCode = (pixKey, holderName, city, amount, txid = '***') => {
    const formatValue = (fieldId, value) => {
        const length = value.length.toString().padStart(2, '0');
        return `${fieldId}${length}${value}`;
    };

    const payload = [
        formatValue('00', '01'), // Payload Format Indicator
        formatValue('26', [
            formatValue('00', 'br.gov.bcb.pix'), // GUI
            formatValue('01', pixKey), // Chave PIX
        ].join('')),
        formatValue('52', '0000'), // Merchant Category Code
        formatValue('53', '986'), // Transaction Currency (BRL)
        formatValue('54', parseFloat(amount).toFixed(2)), // Transaction Amount
        formatValue('58', 'BR'), // Country Code
        formatValue('59', holderName.substring(0, 25)), // Merchant Name
        formatValue('60', city.substring(0, 15)), // Merchant City
        formatValue('62', formatValue('05', txid)), // Transaction ID
    ].join('');

    const crc16 = (payload) => {
        let crc = 0xFFFF;
        for (let i = 0; i < payload.length; i++) {
            crc ^= payload.charCodeAt(i) << 8;
            for (let j = 0; j < 8; j++) {
                crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
            }
        }
        return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    };

    const finalPayload = `${payload}6304`;
    return finalPayload + crc16(finalPayload);
};


// --- CORE LOGIC ---
const calculateParkingFee = (entryTime, exitTime) => {
    const { hourlyRate, toleranceMinutes, fractionRate, fractionLimitMinutes } = state.settings;

    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    const totalMinutes = Math.ceil(diffMs / (1000 * 60));

    // Se o tempo for zero ou negativo, não há cobrança.
    if (totalMinutes <= 0) {
        return 0;
    }

    // REGRA 1: De 1 a 60 minutos, paga uma hora cheia.
    if (totalMinutes <= 60) {
        return hourlyRate;
    }

    // A partir de 61 minutos:
    const fullHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;

    // Se for exatamente uma hora cheia (ex: 120 min), não há minutos restantes.
    if (remainingMinutes === 0) {
        return fullHours * hourlyRate;
    }
    
    // REGRA 2: Se os minutos restantes estiverem dentro da tolerância, pague apenas pelas horas cheias.
    if (remainingMinutes <= toleranceMinutes) {
        return fullHours * hourlyRate;
    }

    // REGRA 3: Se passar da tolerância mas estiver abaixo do limite da fração, pague as horas + fração.
    if (remainingMinutes < fractionLimitMinutes) {
        return (fullHours * hourlyRate) + fractionRate;
    } 
    
    // REGRA 4: Se atingir ou passar o limite da fração, arredonde para a próxima hora cheia.
    else { // remainingMinutes >= fractionLimitMinutes
        return (fullHours + 1) * hourlyRate;
    }
};

// --- RENDER FUNCTIONS ---
const renderHeader = () => {
    return `
        <header class="flex flex-col items-center md:flex-row md:justify-between mb-6 space-y-4 md:space-y-0">
            <h1 class="text-3xl font-bold text-sky-500 flex items-center gap-2 cursor-pointer" data-action="header-title-click"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-car-front"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.64 5H8.36a2 2 0 0 0-1.86 1.3L5 10l-2-2"/><path d="M5 10h14"/><path d="M5 12.5v3.76a2 2 0 0 0 1.11 1.79l.9.44a2 2 0 0 0 1.98 0l.9-.44A2 2 0 0 0 11 16.26V12.5"/><path d="M19 12.5v3.76a2 2 0 0 1-1.11 1.79l-.9.44a2 2 0 0 1-1.98 0l-.9-.44A2 2 0 0 1 13 16.26V12.5"/><path d="M5 18h.01"/><path d="M19 18h.01"/></svg>Pare Aqui!!</h1>
            <div class="flex items-center space-x-4">
                <nav class="flex space-x-2 bg-slate-200 dark:bg-slate-800 p-1 rounded-full">
                    <button data-action="navigate" data-page="operational" class="${state.currentPage === 'operational' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Operacional</button>
                    <button data-action="navigate" data-page="reports" class="${state.currentPage === 'reports' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Relatórios</button>
                    <button data-action="navigate" data-page="admin" class="${state.currentPage === 'admin' ? 'bg-sky-500 text-white' : ''} px-3 py-1 rounded-full text-sm font-semibold transition-colors">Configurações</button>
                </nav>
            </div>
        </header>
    `;
};

const getVehicleListHTML = () => {
    let parkedVehicles = state.vehicles.filter(v => v.status === 'parked');
    
    if (state.operationalSearchQuery) {
        parkedVehicles = parkedVehicles.filter(v => v.plate.toUpperCase().includes(state.operationalSearchQuery.toUpperCase()));
    }
    
    parkedVehicles.sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));

    const html = parkedVehicles.length > 0 ? parkedVehicles.map(v => `
        <li class="flex items-center justify-between p-3 bg-slate-200 dark:bg-slate-800 rounded-lg border-l-4 border-sky-500 dark:border-sky-500">
            <div>
                <p class="font-mono text-lg font-bold">${v.plate}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">${v.brand} - ${v.color}</p>
                <p class="text-sm text-slate-600 dark:text-slate-400">Entrada: ${formatDate(v.entryTime)}</p>
            </div>
            <button data-action="start-exit-vehicle" data-id="${v.id}" class="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Registrar Saída</button>
        </li>
    `).join('') : '<p class="text-center text-slate-500 dark:text-slate-400 py-4">Pátio vazio ou nenhum veículo encontrado.</p>';

    return { html, count: parkedVehicles.length };
}

const updateVehicleList = () => {
    const { html, count } = getVehicleListHTML();

    const vehicleListContainer = document.querySelector('.md\\:col-span-2 ul');
    if (vehicleListContainer) {
        vehicleListContainer.innerHTML = html;
    }

    const vehicleCountEl = document.querySelector('.md\\:col-span-2 h2');
    if (vehicleCountEl) {
        vehicleCountEl.textContent = `Veículos no Pátio (${count})`;
    }
};

const renderOperationalPage = () => {
    const { html: vehicleList, count: parkedVehiclesCount } = getVehicleListHTML();

    const brands = ["Fiat", "Chevrolet", "Volkswagen", "Ford", "Renault", "Hyundai", "Toyota", "Honda", "Jeep", "Nissan", "Citroën", "Peugeot", "Mitsubishi", "Caoa Chery", "BMW", "Mercedes-Benz", "Audi", "Kia", "Land Rover", "Volvo"];
    const colors = ["Preto", "Branco", "Prata", "Cinza", "Vermelho", "Azul", "Marrom", "Verde", "Amarelo", "Dourado", "Laranja", "Roxo"];

    return `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <h2 class="text-xl font-bold mb-4">Registrar Entrada</h2>
                <form id="add-vehicle-form" class="space-y-4">
                    <div class="relative">
                        <label for="plate" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Placa</label>
                        <div class="flex items-center">
                            <input type="text" id="plate" name="plate" required class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500" placeholder="ABC-1234">
                            <button type="button" data-action="open-scanner" data-target-input="plate" class="ml-2 p-2 rounded-md bg-sky-500 text-white hover:bg-sky-600">
                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-.707-.707A2 2 0 0012.414 4H7.586a2 2 0 00-1.293.293L5.586 5H4zm6 8a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label for="brand" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Marca</label>
                        <select id="brand" name="brand" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500">
                            ${brands.map(b => `<option value="${b}">${b}</option>`).join('')}
                        </select>
                    </div>
                     <div>
                        <label for="color" class="block text-sm font-medium text-slate-700 dark:text-slate-300">Cor</label>
                        <select id="color" name="color" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500">
                             ${colors.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <button type="submit" data-action="add-vehicle" class="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Adicionar Veículo</button>
                </form>
            </div>
            <div class="md:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <h2 class="text-xl font-bold mb-4">Veículos no Pátio (${parkedVehiclesCount})</h2>
                <div class="flex items-center mb-4">
                    <input type="text" id="plate-search" placeholder="Buscar por placa..." class="block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500" value="${state.operationalSearchQuery}">
                    <button type="button" data-action="open-scanner" data-target-input="plate-search" class="ml-2 p-2 flex-shrink-0 rounded-md bg-sky-500 text-white hover:bg-sky-600">
                         <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586l-.707-.707A2 2 0 0012.414 4H7.586a2 2 0 00-1.293.293L5.586 5H4zm6 8a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
                    </button>
                </div>
                <ul class="space-y-3 max-h-96 overflow-y-auto pr-2">${vehicleList}</ul>
            </div>
        </div>
        <div id="modal-container"></div>
    `;
};

const renderReportsPage = () => {
    // --- Filtering Logic ---
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateFilters = {
        today: (v) => new Date(v.exitTime) >= today,
        '7days': (v) => new Date(v.exitTime) >= new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000),
        '15days': (v) => new Date(v.exitTime) >= new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000),
        '30days': (v) => new Date(v.exitTime) >= new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000),
    };

    const allPaidVehicles = state.vehicles.filter(v => v.status === 'paid' && v.exitTime).sort((a, b) => new Date(b.exitTime) - new Date(a.exitTime));

    const dateFilteredVehicles = allPaidVehicles.filter(dateFilters[state.reportsDateFilter]);

    const finalFilteredVehicles = state.reportsPaymentFilter === 'todos'
        ? dateFilteredVehicles
        : dateFilteredVehicles.filter(v => v.paymentMethod === state.reportsPaymentFilter);

    // --- Calculation Logic ---
    const totalRevenue = dateFilteredVehicles
        .filter(v => v.paymentMethod !== 'convenio')
        .reduce((acc, v) => acc + (v.amountPaid || 0), 0);
        
    const totalFilteredRevenue = finalFilteredVehicles
        .reduce((acc, v) => acc + (v.amountPaid || 0), 0);

    // --- Rendering Logic ---

    // Date filter buttons
    const dateFilterButtons = [
        { key: 'today', label: 'Hoje' },
        { key: '7days', label: '7 Dias' },
        { key: '15days', label: '15 Dias' },
        { key: '30days', label: '30 Dias' },
    ].map(f => `
        <button 
            data-action="set-report-date-filter" 
            data-filter="${f.key}" 
            class="${state.reportsDateFilter === f.key ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700'} px-4 py-2 rounded-lg text-sm font-semibold transition-colors">
            ${f.label}
        </button>
    `).join('');

    // Payment method filter buttons
    const paymentMethods = ['todos', 'pix', 'dinheiro', 'cartao', 'convenio'];
    const paymentFilterButtons = paymentMethods.map(m => `
        <button 
            data-action="set-report-payment-filter" 
            data-filter="${m}"
            class="${state.reportsPaymentFilter === m ? 'bg-sky-500 text-white' : 'bg-slate-200 dark:bg-slate-700'} flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-colors capitalize">
            ${m === 'todos' ? 'Todos' : m}
        </button>
    `).join('');

    // Payment method tag styles
    const paymentTagStyles = {
        pix: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
        dinheiro: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
        cartao: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        convenio: 'bg-slate-100 text-slate-800 dark:bg-slate-600 dark:text-slate-200',
        default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    };
    
    // Vehicle list cards
    const vehicleList = finalFilteredVehicles.length > 0 ? finalFilteredVehicles.map(v => {
        const tagStyle = paymentTagStyles[v.paymentMethod] || paymentTagStyles.default;
        return `
        <div class="bg-slate-100 dark:bg-slate-900 p-4 rounded-lg space-y-3">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-mono text-xl font-bold">${v.plate}</p>
                    <p class="text-sm text-slate-600 dark:text-slate-400">${v.brand || 'N/A'} - ${v.color || 'N/A'}</p>
                </div>
                <div class="text-right">
                    <p class="text-xl font-bold text-green-600 dark:text-green-400">${formatCurrency(v.amountPaid)}</p>
                    <span class="text-xs font-semibold px-2 py-1 rounded-full capitalize ${tagStyle}">
                        ${v.paymentMethod || 'Não Definido'}
                    </span>
                </div>
            </div>
            <div class="flex justify-between items-center text-center text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 pt-2">
                <div>
                    <p class="font-semibold">ENTRADA</p>
                    <p class="font-mono text-slate-800 dark:text-slate-200">${formatDate(v.entryTime)}</p>
                </div>
                <div>
                    <p class="font-semibold">SAÍDA</p>
                    <p class="font-mono text-slate-800 dark:text-slate-200">${formatDate(v.exitTime)}</p>
                </div>
                <div>
                    <p class="font-semibold">PERMANÊNCIA</p>
                    <p class="font-mono text-slate-800 dark:text-slate-200">${formatPermanence(v.entryTime, v.exitTime)}</p>
                </div>
            </div>
        </div>
    `}).join('') : '<p class="text-center text-slate-500 dark:text-slate-400 py-4">Nenhum registro encontrado para os filtros selecionados.</p>';

    // Main return statement
    return `
        <div class="space-y-6">
            <h2 class="text-2xl font-bold">Relatório - ${new Date().toLocaleDateString('pt-BR')}</h2>
            
            <div class="flex space-x-2">
                ${dateFilterButtons}
            </div>

            <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <p class="text-sm text-slate-600 dark:text-slate-400">Total Arrecadado no Período</p>
                <p class="text-4xl font-bold">${formatCurrency(totalRevenue)}</p>
                <p class="text-xs text-slate-500 dark:text-slate-500">(exceto convênio)</p>
            </div>

            <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg">
                <h3 class="text-xl font-bold mb-4">Saídas Registradas no Período</h3>
                <div class="flex flex-nowrap gap-2 mb-4 overflow-x-auto hide-scrollbar pb-2">
                    ${paymentFilterButtons}
                </div>
                <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <p class="text-right font-semibold mb-4">
                        Total (${state.reportsPaymentFilter === 'todos' ? 'Todos' : state.reportsPaymentFilter.charAt(0).toUpperCase() + state.reportsPaymentFilter.slice(1)}): 
                        <span class="text-lg">${formatCurrency(totalFilteredRevenue)}</span>
                    </p>
                    <div class="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                        ${vehicleList}
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderAdminPage = () => {
    const { settings } = state;
    return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg space-y-8">
            <h2 class="text-2xl font-bold">Configurações do Sistema</h2>
            
            <!-- Precificação -->
            <div>
                <h3 class="text-lg font-semibold mb-2 border-b border-slate-300 dark:border-slate-600 pb-1">Precificação</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                    <div class="space-y-4">
                        <div>
                            <label for="hourlyRate" class="block text-sm font-medium">Valor da Hora (R$)</label>
                            <input type="number" id="hourlyRate" data-setting="hourlyRate" value="${settings.hourlyRate}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="toleranceMinutes" class="block text-sm font-medium">Minutos de Tolerância (após 1ª hora)</label>
                            <input type="number" id="toleranceMinutes" data-setting="toleranceMinutes" value="${settings.toleranceMinutes}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                    </div>
                    <div class="space-y-4">
                         <div>
                            <label for="fractionRate" class="block text-sm font-medium">Valor da Fração (R$)</label>
                            <input type="number" id="fractionRate" data-setting="fractionRate" value="${settings.fractionRate}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="fractionLimitMinutes" class="block text-sm font-medium">Minuto Limite para Fração (após tolerância)</label>
                            <input type="number" id="fractionLimitMinutes" data-setting="fractionLimitMinutes" value="${settings.fractionLimitMinutes}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                    </div>
                </div>
            </div>

            <!-- PIX Estático -->
            <div>
                <h3 class="text-lg font-semibold mb-2 border-b border-slate-300 dark:border-slate-600 pb-1">PIX Estático</h3>
                 <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Usado para gerar o QR Code quando o PIX dinâmico está desativado.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="space-y-4">
                        <div>
                            <label for="pixKey" class="block text-sm font-medium">Chave PIX</label>
                            <input type="text" id="pixKey" data-setting="pixKey" value="${settings.pixKey}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                        <div>
                            <label for="pixHolderName" class="block text-sm font-medium">Nome do Titular</label>
                            <input type="text" id="pixHolderName" data-setting="pixHolderName" value="${settings.pixHolderName}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                         <div>
                            <label for="pixHolderCity" class="block text-sm font-medium">Cidade do Titular</label>
                            <input type="text" id="pixHolderCity" data-setting="pixHolderCity" value="${settings.pixHolderCity}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                        </div>
                    </div>
                </div>
            </div>

             <!-- PIX Dinâmico -->
            <div>
                <h3 class="text-lg font-semibold mb-2 border-b border-slate-300 dark:border-slate-600 pb-1">PIX Dinâmico (Mercado Pago)</h3>
                 <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">Gera um QR Code único para cada transação e confirma o pagamento automaticamente.</p>
                <div class="space-y-4">
                     <div>
                        <label for="mercadoPagoAccessToken" class="block text-sm font-medium">Access Token do Mercado Pago</label>
                        <input type="password" id="mercadoPagoAccessToken" data-setting="mercadoPagoAccessToken" value="${settings.mercadoPagoAccessToken}" class="mt-1 block w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md">
                    </div>
                    <div class="flex items-center">
                        <label for="useMercadoPago" class="block text-sm font-medium mr-4">Ativar PIX dinâmico</label>
                        <label class="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" id="useMercadoPago" data-setting="useMercadoPago" class="sr-only peer" ${settings.useMercadoPago ? 'checked' : ''}>
                          <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>
            </div>
        </div>
    `;
};


const renderCheckoutSelectionPage = () => {
    const vehicle = state.vehicles.find(v => v.id === state.selectedVehicleId);
    if (!vehicle) {
        state.currentPage = 'operational';
        renderApp();
        return;
    }

    const exitTime = new Date();
    const amount = calculateParkingFee(vehicle.entryTime, exitTime);
    const permanence = formatPermanence(vehicle.entryTime, exitTime);

    state.paymentData = { vehicle, exitTime: exitTime.toISOString(), amount, permanence };

    return `
       <div id="checkout-selection-page" class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto">
            <div class="flex justify-between items-start">
                <h2 class="text-2xl font-bold mb-4">Registrar Saída</h2>
                <button data-action="navigate" data-page="operational" class="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 text-2xl leading-none">&times;</button>
            </div>
            <div class="mb-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p><strong>Placa:</strong> ${vehicle.plate}</p>
                <p><strong>Permanência:</strong> ${permanence}</p>
                <p class="text-2xl font-bold mt-2">Total a Pagar: ${formatCurrency(amount)}</p>
            </div>
            <h3 class="text-lg font-semibold mb-3">Selecione a Forma de Pagamento:</h3>
            <div class="grid grid-cols-2 gap-4">
                 <button data-action="select-payment-method" data-method="pix" class="col-span-2 p-4 bg-cyan-500 text-white rounded-lg font-semibold text-center hover:bg-cyan-600 transition-colors flex items-center justify-center space-x-2 text-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    <span>Pagar com PIX</span>
                 </button>
                 <button data-action="select-payment-method" data-method="dinheiro" class="p-4 bg-green-500 text-white rounded-lg font-semibold text-center hover:bg-green-600 transition-colors">Dinheiro</button>
                 <button data-action="select-payment-method" data-method="cartao" class="p-4 bg-sky-500 text-white rounded-lg font-semibold text-center hover:bg-sky-600 transition-colors">Cartão</button>
                 <button data-action="select-payment-method" data-method="convenio" class="col-span-2 p-4 bg-slate-500 text-white rounded-lg font-semibold text-center hover:bg-slate-600 transition-colors">Convênio</button>
            </div>
            <div id="payment-error" class="text-red-500 text-sm mt-4 text-center"></div>
        </div>
    `;
}

const renderPixPaymentPage = () => {
    const { vehicle, amount } = state.paymentData;

    return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto text-center">
            <h2 class="text-2xl font-bold mb-2">Pagamento via PIX</h2>
            <div class="mb-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p><strong>Placa:</strong> ${vehicle.plate}</p>
                <p class="text-2xl font-bold mt-2">Total a Pagar: ${formatCurrency(amount)}</p>
            </div>
            
            <p id="pix-instruction" class="mb-4">Escaneie o QR Code com o app do seu banco:</p>

            <div id="qrcode" class="flex justify-center items-center p-4 bg-white rounded-lg mb-4 w-64 h-64 mx-auto">
                <!-- QR Code will be rendered here -->
                <div class="loader"></div>
            </div>

            <p class="mb-2">Ou use o PIX Copia e Cola:</p>
            <div class="flex mb-4">
                <input type="text" id="pix-copy-paste" readonly class="w-full bg-slate-200 dark:bg-slate-700 rounded-l-md p-2 text-sm" placeholder="Aguardando código...">
                <button data-action="copy-pix" class="bg-sky-500 text-white px-4 rounded-r-md hover:bg-sky-600">Copiar</button>
            </div>
            
            <div id="pix-status-container" class="mt-6">
                <!-- Status/Confirmation will be rendered here -->
            </div>
        </div>
    `;
};

const renderStandardPaymentPage = (method) => {
    const { vehicle, amount, permanence } = state.paymentData;
    const methodColors = {
        dinheiro: "bg-green-500 hover:bg-green-600",
        cartao: "bg-sky-500 hover:bg-sky-600",
        convenio: "bg-slate-500 hover:bg-slate-600"
    };

    return `
         <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-lg mx-auto">
            <h2 class="text-2xl font-bold mb-2">Confirmar Pagamento</h2>
            <div class="mb-4 p-4 bg-slate-100 dark:bg-slate-700 rounded-lg">
                <p><strong>Placa:</strong> ${vehicle.plate}</p>
                <p><strong>Permanência:</strong> ${permanence}</p>
                <p class="text-2xl font-bold mt-2">Total a Pagar: ${formatCurrency(amount)}</p>
                <p class="mt-2"><strong>Método:</strong> <span class="capitalize font-semibold">${method}</span></p>
            </div>
             <button data-action="confirm-payment" data-method="${method}" class="w-full text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg ${methodColors[method] || 'bg-gray-500'}">
                Confirmar Saída e Registrar Pagamento
            </button>
            <button data-action="cancel-payment" class="mt-4 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
                Voltar
            </button>
        </div>
    `;
};

const renderSuccessPage = () => {
    const { vehicle, amount, exitTime, permanence, paymentMethod } = state.paymentData;
    return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-md mx-auto text-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-green-500 mx-auto mb-4" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <h2 class="text-2xl font-bold mb-2">Pagamento Aprovado!</h2>
            <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">Seu recibo está sendo preparado para impressão.</p>
            
            <!-- Div com o conteúdo para impressão -->
            <div id="receipt-container" class="text-left my-6 space-y-2 p-4 border-t border-b border-dashed border-slate-300 dark:border-slate-600">
                 <h3 class="text-center font-bold text-lg mb-4">CUPOM NÃO FISCAL</h3>
                 <p><strong>Placa:</strong> <span class="font-mono float-right">${vehicle.plate}</span></p>
                 <p><strong>Entrada:</strong> <span class="font-mono float-right">${formatDate(vehicle.entryTime)}</span></p>
                 <p><strong>Saída:</strong> <span class="font-mono float-right">${formatDate(exitTime)}</span></p>
                 <p><strong>Permanência:</strong> <span class="font-mono float-right">${permanence}</span></p>
                 <p><strong>Pagamento:</strong> <span class="font-mono float-right capitalize">${paymentMethod}</span></p>
                 <p class="text-xl font-bold mt-4"><strong>TOTAL PAGO:</strong> <span class="font-mono float-right">${formatCurrency(amount)}</span></p>
            </div>
            
            <button id="print-button" data-action="print-receipt" class="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-2 px-4 rounded-lg transition-colors mb-2">Imprimir Cupom</button>
            <button data-action="navigate" data-page="operational" class="w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">Voltar ao Pátio</button>
        </div>
    `;
}

const renderScannerModal = () => {
    return `
        <div id="scanner-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl w-full max-w-lg">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="text-lg font-bold">Escanear Placa</h3>
                    <button data-action="close-modal" class="text-2xl leading-none">&times;</button>
                </div>
                <div class="relative w-full aspect-video bg-black rounded-md overflow-hidden">
                    <video id="scanner-video" class="w-full h-full" autoplay playsinline></video>
                    <div id="scanner-guide" class="absolute inset-0 border-0 pointer-events-none"></div>
                    <canvas id="scanner-canvas" class="hidden"></canvas> <!-- Canvas for processing -->
                </div>
                <div id="scanner-controls" class="text-center mt-4 space-y-2">
                    <p id="scanner-status" class="text-sm h-5 flex items-center justify-center">
                        <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Iniciando câmera...
                    </p>
                    <div id="scanner-result-display" class="hidden font-mono text-lg my-2 p-2 bg-slate-100 dark:bg-slate-700 rounded-md"></div>
                    <div id="scanner-confirmation-buttons" class="hidden space-x-2">
                         <button data-action="accept-scan" class="w-1/2 bg-green-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-600 transition-colors">Aceitar</button>
                         <button data-action="retry-scan" class="w-1/2 bg-yellow-500 text-white px-4 py-2 rounded-lg font-semibold hover:bg-yellow-600 transition-colors">Escanear Novamente</button>
                    </div>
                </div>
            </div>
        </div>
    `;
};

const renderResetPasswordModal = () => {
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
        <div id="reset-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                <h3 class="text-lg font-bold mb-4">Acesso Restrito</h3>
                <p class="text-sm mb-4">Digite a senha para acessar a área de reset.</p>
                <input type="password" id="reset-password-input" class="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md mb-4" placeholder="Senha">
                <p id="reset-error" class="text-red-500 text-sm h-5 mb-2"></p>
                <div class="flex space-x-2">
                    <button data-action="cancel-reset" class="w-1/2 bg-slate-500 text-white px-4 py-2 rounded-lg hover:bg-slate-600">Cancelar</button>
                    <button data-action="confirm-reset-password" class="w-1/2 bg-sky-500 text-white px-4 py-2 rounded-lg hover:bg-sky-600">Entrar</button>
                </div>
            </div>
        </div>
    `;
};

const renderResetConfirmationModal = () => {
     const modalContainer = document.getElementById('modal-container');
     modalContainer.innerHTML = `
        <div id="reset-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div class="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl w-full max-w-sm text-center">
                <h3 class="text-xl font-bold mb-2 text-red-500">ATENÇÃO!</h3>
                <p class="text-sm mb-4">
                    Tem certeza que deseja resetar a aplicação? Todos os dados de veículos e relatórios serão 
                    <strong class="font-bold">apagados permanentemente</strong>. 
                    As configurações serão mantidas.
                </p>
                <div class="flex space-x-2 mt-6">
                    <button data-action="cancel-reset" class="w-1/2 bg-slate-500 text-white px-4 py-2 rounded-lg hover:bg-slate-600">Cancelar</button>
                    <button data-action="confirm-reset-app" class="w-1/2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700">RESETAR DADOS</button>
                </div>
            </div>
        </div>
    `;
};


let renderApp = () => {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    if (state.paymentPollingInterval) {
        clearInterval(state.paymentPollingInterval);
        state.paymentPollingInterval = null;
    }

    let content = '';
    switch (state.currentPage) {
        case 'operational':
            content = renderOperationalPage();
            break;
        case 'reports':
            content = renderReportsPage();
            break;
        case 'admin':
            content = renderAdminPage();
            break;
        case 'checkout-selection':
            content = renderCheckoutSelectionPage();
            break;
        case 'checkout-pix':
            content = renderPixPaymentPage();
            break;
        case 'checkout-standard':
            content = renderStandardPaymentPage(state.paymentData.paymentMethod);
            break;
        case 'checkout-success':
            content = renderSuccessPage();
            break;
        default:
            content = renderOperationalPage();
    }
    appEl.innerHTML = renderHeader() + content;
    
    // After rendering, add specific listeners
    if (state.currentPage === 'operational') {
        const searchInput = document.getElementById('plate-search');
        if (searchInput) {
            searchInput.addEventListener('input', handleOperationalSearch);
        }
    }
    if (state.currentPage === 'checkout-pix') {
        initializePixScreen();
    }
    if (state.currentPage === 'checkout-success') {
        const printButton = document.getElementById('print-button');
        if (printButton) {
            printButton.onclick = () => window.print();
        }
    }
};

const scanPlate = async () => {
    if (isScanning) return;
    const confirmationButtons = document.getElementById('scanner-confirmation-buttons');
    if (confirmationButtons && !confirmationButtons.classList.contains('hidden')) {
        return; // Already found a plate, waiting for user confirmation
    }

    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    const canvas = document.getElementById('scanner-canvas');

    if (!video || video.readyState < video.HAVE_METADATA) return;

    try {
        isScanning = true;
        
        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        const base64Data = dataUrl.split(',')[1];

        statusEl.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Analisando com IA...`;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const imagePart = {
            inlineData: { mimeType: 'image/jpeg', data: base64Data },
        };
        const textPart = {
            text: 'Extraia o texto da placa do veículo nesta imagem. Responda APENAS com os caracteres da placa, sem nenhuma formatação, explicação ou texto adicional. Se não houver uma placa clara, responda "N/A".'
        };

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });

        const resultText = response.text.trim().toUpperCase();

        if (resultText && resultText !== 'N/A') {
            const cleanedPlate = resultText.replace(/[^A-Z0-9]/g, '');
            const plateRegex = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

            if (plateRegex.test(cleanedPlate)) {
                if (scanInterval) {
                    clearInterval(scanInterval);
                    scanInterval = null;
                }
                
                let formattedPlate = cleanedPlate;
                if (/^[A-Z]{3}[0-9]{4}$/.test(cleanedPlate)) { // Old format ABC1234
                    formattedPlate = cleanedPlate.slice(0, 3) + '-' + cleanedPlate.slice(3);
                }

                statusEl.innerHTML = '<span class="text-green-500 font-semibold">Placa encontrada! Confirme abaixo.</span>';
                const resultDisplay = document.getElementById('scanner-result-display');
                
                if(resultDisplay) {
                    resultDisplay.textContent = formattedPlate;
                    resultDisplay.dataset.plate = formattedPlate;
                    resultDisplay.classList.remove('hidden');
                }
                if(confirmationButtons) confirmationButtons.classList.remove('hidden');
            } else {
                 statusEl.innerHTML = `
                    <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Procurando placa...`;
            }
        } else {
             statusEl.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Procurando placa...`;
        }

    } catch (err) {
        console.error('Gemini Scanner Error:', err);
        statusEl.innerHTML = `<span class="text-red-500">Erro na análise. Verifique a conexão e tente novamente.</span>`;
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = null; // Stop scanning on API error
    } finally {
        isScanning = false;
    }
};


// --- EVENT HANDLERS & ACTIONS ---
const handleAppClick = (e) => {
    const target = e.target.closest('[data-action]');
    
    // Handle hidden reset feature
    if (e.target.closest('[data-action="header-title-click"]')) {
        clearTimeout(headerClickTimer);
        headerClickCount++;
        if (headerClickCount === 5) {
            headerClickCount = 0;
            renderResetPasswordModal();
        }
        headerClickTimer = setTimeout(() => { headerClickCount = 0; }, 1500); // Reset after 1.5 seconds
    }
    
    if (!target) return;

    const action = target.dataset.action;
    const page = target.dataset.page;
    const id = target.dataset.id;
    const method = target.dataset.method;
    const filter = target.dataset.filter;

    switch (action) {
        case 'navigate':
            state.currentPage = page;
            renderApp();
            break;
        case 'add-vehicle':
            e.preventDefault();
            const form = document.getElementById('add-vehicle-form');
            const plate = form.plate.value.toUpperCase().trim();
            const brand = form.brand.value;
            const color = form.color.value;

            if (plate) {
                const newVehicle = {
                    id: `v_${Date.now()}`,
                    plate,
                    brand,
                    color,
                    entryTime: new Date().toISOString(),
                    status: 'parked'
                };
                db.ref('vehicles').push(newVehicle);
                form.reset();
            }
            break;
        case 'start-exit-vehicle':
            state.selectedVehicleId = id;
            state.currentPage = 'checkout-selection';
            renderApp();
            break;
        case 'select-payment-method':
            state.paymentData.paymentMethod = method;
            if (method === 'pix') {
                state.currentPage = 'checkout-pix';
            } else {
                state.currentPage = 'checkout-standard';
            }
            renderApp();
            break;
        case 'cancel-payment':
            state.currentPage = 'checkout-selection';
            renderApp();
            break;
        case 'confirm-payment':
            if (state.paymentData) {
                finishPayment(method);
            }
            break;
        case 'copy-pix':
            const pixInput = document.getElementById('pix-copy-paste');
            if(pixInput && pixInput.value) {
                pixInput.select();
                document.execCommand('copy');
                target.textContent = 'Copiado!';
                setTimeout(() => target.textContent = 'Copiar', 2000);
            }
            break;
        case 'open-scanner':
            e.preventDefault();
            const targetInputId = target.dataset.targetInput || 'plate';
            state.scannerTargetInputId = targetInputId;
            document.getElementById('modal-container').innerHTML = renderScannerModal();
            startScanner();
            break;
        case 'close-modal':
            stopScanner();
            document.getElementById('modal-container').innerHTML = '';
            state.scannerTargetInputId = null;
            break;
        case 'accept-scan':
            const resultEl = document.getElementById('scanner-result-display');
            const targetInput = state.scannerTargetInputId ? document.getElementById(state.scannerTargetInputId) : null;
            
            if (resultEl && resultEl.dataset.plate && targetInput) {
                targetInput.value = resultEl.dataset.plate;
                if (state.scannerTargetInputId === 'plate-search') {
                    // Update state and re-render only the list
                    state.operationalSearchQuery = resultEl.dataset.plate;
                    updateVehicleList(); 
                }
            }
            
            // Re-use close-modal logic
            const closeModalButton = document.querySelector('#scanner-modal [data-action="close-modal"]');
            if (closeModalButton) handleAppClick({ target: closeModalButton });
            
            break;
        case 'retry-scan':
            document.getElementById('scanner-status').innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Procurando placa...
            `;
            document.getElementById('scanner-result-display').classList.add('hidden');
            document.getElementById('scanner-confirmation-buttons').classList.add('hidden');
            if (!scanInterval) {
                scanInterval = setInterval(scanPlate, 3000);
            }
            break;
        case 'set-report-date-filter':
            state.reportsDateFilter = filter;
            renderApp();
            break;
        case 'set-report-payment-filter':
            state.reportsPaymentFilter = filter;
            renderApp();
            break;
        case 'confirm-reset-password':
            const passwordInput = document.getElementById('reset-password-input');
            const errorEl = document.getElementById('reset-error');
            if (passwordInput.value === 'cambio') {
                renderResetConfirmationModal();
            } else {
                errorEl.textContent = 'Senha incorreta.';
                passwordInput.value = '';
            }
            break;
        case 'cancel-reset':
             document.getElementById('modal-container').innerHTML = '';
             headerClickCount = 0;
            break;
        case 'confirm-reset-app':
            db.ref('vehicles').remove().then(() => {
                alert('Dados resetados com sucesso!');
                document.getElementById('modal-container').innerHTML = '';
                headerClickCount = 0;
            }).catch((err) => {
                alert('Erro ao resetar os dados: ' + err.message);
            });
            break;
    }
};

const handleSettingsChange = debounce((e) => {
    const target = e.target.closest('[data-setting]');
    if (target) {
        const key = target.dataset.setting;
        let value = target.value;
        if (target.type === 'number') {
            value = parseFloat(target.value);
        } else if (target.type === 'checkbox') {
            value = target.checked;
        }
        db.ref('settings').child(key).set(value);
    }
}, 300);

const handleOperationalSearch = debounce((e) => {
    state.operationalSearchQuery = e.target.value;
    if (state.currentPage === 'operational') {
        updateVehicleList();
    }
}, 300);

const handleAppInput = (e) => {
    const target = e.target;
    // Force plate inputs to uppercase
    if (target.id === 'plate' || target.id === 'plate-search') {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        target.value = target.value.toUpperCase();
        target.setSelectionRange(start, end);
    }

    handleSettingsChange(e);
};


const finishPayment = (paymentMethod) => {
    // Stop polling if it's running
    if (state.paymentPollingInterval) {
        clearInterval(state.paymentPollingInterval);
        state.paymentPollingInterval = null;
    }

    const { vehicle, exitTime, amount } = state.paymentData;
    const vehicleUpdates = {
        status: 'paid',
        exitTime: exitTime,
        amountPaid: amount,
        paymentMethod: paymentMethod
    };

    const dbKey = state.vehicles.find(v => v.id === vehicle.id).__dbKey;
    if (dbKey) {
        db.ref('vehicles').child(dbKey).update(vehicleUpdates).then(() => {
            state.currentPage = 'checkout-success';
            renderApp();
        });
    }
};


// --- PLATE SCANNER ---
const startScanner = async () => {
    const video = document.getElementById('scanner-video');
    const statusEl = document.getElementById('scanner-status');
    const scannerControls = document.getElementById('scanner-controls');

    const showPermissionError = () => {
        const statusHTML = `<span class="text-red-500 font-semibold">Acesso à câmera negado.</span>`;
        if (scannerControls) {
            scannerControls.innerHTML = `
                <p id="scanner-status" class="text-sm h-5 flex items-center justify-center">${statusHTML}</p>
                <p class="text-sm text-center text-slate-500 dark:text-slate-400 mt-4 px-4">
                    Para usar o scanner, você precisa permitir o acesso à câmera nas configurações do seu navegador ou sistema operacional.
                </p>
                <button data-action="close-modal" class="mt-4 w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                    Entendi
                </button>
            `;
        }
    };

    try {
        if (navigator.permissions && navigator.permissions.query) {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            if (permissionStatus.state === 'denied') {
                showPermissionError();
                return;
            }
        }
        
        statusEl.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Solicitando permissão...`;

        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        video.srcObject = videoStream;
        await video.play();

        const currentStatusEl = document.getElementById('scanner-status');
        if (currentStatusEl) {
            currentStatusEl.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                Procurando placa...`;
        }
        
        if (scanInterval) clearInterval(scanInterval);
        scanInterval = setInterval(scanPlate, 3000);

    } catch (err) {
        console.error('Camera Error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            showPermissionError();
        } else {
            const errorStatusEl = document.getElementById('scanner-status');
            if(errorStatusEl) errorStatusEl.innerHTML = `<span class="text-red-500">Erro ao iniciar câmera. Verifique se o dispositivo está conectado.</span>`;
        }
    }
};

const stopScanner = () => {
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    isScanning = false;
};

// --- PIX Screen Logic ---
const initializePixScreen = () => {
    const { useMercadoPago, mercadoPagoAccessToken } = state.settings;

    if (useMercadoPago && mercadoPagoAccessToken && mercadoPagoAccessToken.startsWith('APP_USR-')) {
        createMercadoPagoPayment();
    } else {
        generateStaticPix();
    }
};

const generateStaticPix = () => {
    const { amount } = state.paymentData;
    const { pixKey, pixHolderName, pixHolderCity } = state.settings;
    const qrcodeContainer = document.getElementById('qrcode');
    const pixInput = document.getElementById('pix-copy-paste');
    const statusContainer = document.getElementById('pix-status-container');
    
    if (!pixKey || pixKey === "seu-pix@email.com" || !pixHolderName || !pixHolderCity) {
        qrcodeContainer.innerHTML = '<p class="text-red-500 text-sm">Por favor, configure os dados do PIX Estático na tela de Configurações.</p>';
        return;
    }
    
    const brCode = generateBRCode(pixKey, pixHolderName, pixHolderCity, amount);
    pixInput.value = brCode;

    try {
        const qr = qrcode(0, 'M');
        qr.addData(brCode);
        qr.make();
        qrcodeContainer.innerHTML = qr.createImgTag(5, 10);
    } catch (e) {
        qrcodeContainer.innerHTML = '<p class="text-red-500 text-sm">Ocorreu um erro ao gerar o QR Code.</p>';
    }

    statusContainer.innerHTML = `
        <p class="text-yellow-600 dark:text-yellow-400 font-semibold mb-4">Aguardando confirmação manual do pagamento.</p>
        <button data-action="confirm-payment" data-method="pix" class="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg transition-colors text-lg">
            Confirmar Saída e Registrar Pagamento
        </button>
        <button data-action="cancel-payment" class="mt-4 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
            Voltar
        </button>
    `;
};

const createMercadoPagoPayment = async () => {
    const qrcodeContainer = document.getElementById('qrcode');
    const pixInput = document.getElementById('pix-copy-paste');
    const statusContainer = document.getElementById('pix-status-container');
    const pixInstruction = document.getElementById('pix-instruction');
    const { amount } = state.paymentData;
    const { mercadoPagoAccessToken } = state.settings;

    const getExpirationDate = () => {
        const date = new Date();
        date.setMinutes(date.getMinutes() + 10); // 10 minutes expiration
        const offset = -date.getTimezoneOffset();
        const sign = offset >= 0 ? '+' : '-';
        const pad = (num) => num.toString().padStart(2, '0');
        const offsetHours = pad(Math.floor(Math.abs(offset) / 60));
        const offsetMinutes = pad(Math.abs(offset) % 60);
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${(date.getMilliseconds()).toString().padStart(3, '0')}${sign}${offsetHours}:${offsetMinutes}`;
    };

    const paymentData = {
        transaction_amount: amount,
        description: `Pagamento Estacionamento - Placa ${state.paymentData.vehicle.plate}`,
        payment_method_id: 'pix',
        payer: {
            email: `pagamento-placa-${state.paymentData.vehicle.plate.toLowerCase().replace(/[^a-z0-9]/g, '')}@parqueaqui.com`,
            first_name: "Cliente",
            last_name: "Estacionamento",
        },
        date_of_expiration: getExpirationDate(),
    };

    try {
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent('https://api.mercadopago.com/v1/payments')}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mercadoPagoAccessToken}`,
                'X-Idempotency-Key': `${state.paymentData.vehicle.id}-${Date.now()}`
            },
            body: JSON.stringify(paymentData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Erro desconhecido');
        }

        const qrCodeBase64 = data.point_of_interaction.transaction_data.qr_code_base64;
        const qrCodeCopyPaste = data.point_of_interaction.transaction_data.qr_code;
        
        qrcodeContainer.innerHTML = `<img src="data:image/png;base64,${qrCodeBase64}" alt="QR Code PIX" class="w-full h-full object-contain">`;
        pixInput.value = qrCodeCopyPaste;
        pixInstruction.textContent = "PIX gerado! Escaneie o QR Code para pagar:";

        statusContainer.innerHTML = `
            <div class="flex items-center justify-center text-blue-600 dark:text-blue-400 font-semibold mb-4">
                <div class="loader-small border-blue-500 mr-2"></div>
                Aguardando pagamento...
            </div>
            <style>.loader-small { border: 3px solid #f3f3f3; border-top: 3px solid; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; }</style>
            <button data-action="cancel-payment" class="mt-4 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
                Cancelar e Voltar
            </button>
        `;

        startPaymentPolling(data.id);

    } catch (error) {
        console.error('Erro ao criar pagamento no Mercado Pago:', error);
        qrcodeContainer.innerHTML = `<p class="text-red-500 text-sm">Erro: ${error.message}. Verifique o Access Token nas configurações.</p>`;
        statusContainer.innerHTML = `
             <button data-action="cancel-payment" class="mt-4 w-full bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 dark:hover:bg-slate-500 font-bold py-2 px-4 rounded-lg transition-colors">
                Voltar
            </button>
        `;
    }
};

const startPaymentPolling = (paymentId) => {
    if (state.paymentPollingInterval) {
        clearInterval(state.paymentPollingInterval);
    }
    state.paymentPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(`https://api.mercadopago.com/v1/payments/${paymentId}`)}`, {
                headers: { 'Authorization': `Bearer ${state.settings.mercadoPagoAccessToken}` }
            });
            const data = await response.json();
            if (data.status === 'approved') {
                finishPayment('pix');
            }
        } catch (error) {
            console.error('Erro ao verificar status do pagamento:', error);
            // Stop polling on network error to avoid spamming
            clearInterval(state.paymentPollingInterval);
            state.paymentPollingInterval = null;
        }
    }, 5000); // Check every 5 seconds
};


// --- INITIALIZATION ---
const setupFirebaseListeners = () => {
    db.ref('vehicles').on('value', (snapshot) => {
        const data = snapshot.val();
        const vehiclesArray = data ? Object.keys(data).map(key => ({
            ...data[key],
            __dbKey: key
        })) : [];
        state.vehicles = vehiclesArray;
        
        // Avoid re-rendering on checkout/success pages to prevent interruption
        const sensitivePages = ['checkout-selection', 'checkout-pix', 'checkout-standard', 'checkout-success'];
        if (!sensitivePages.includes(state.currentPage)) {
             renderApp();
        }
    });

    db.ref('settings').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.settings = { ...state.settings, ...data };
        }
         // Avoid re-rendering on checkout/success pages to prevent interruption
        const sensitivePages = ['checkout-selection', 'checkout-pix', 'checkout-standard', 'checkout-success'];
        if (!sensitivePages.includes(state.currentPage)) {
            renderApp();
        }
    });
};

const init = () => {
    applyTheme();
    setupFirebaseListeners();
    document.addEventListener('click', handleAppClick);
    document.getElementById('app').addEventListener('input', handleAppInput);
};

// --- START APP ---
init();