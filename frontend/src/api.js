const API_URL = (import.meta.env.DEV ? '' : import.meta.env.VITE_API_URL || 'https://node-js-express-js-learning-4.onrender.com').replace(/\/$/, '');
const RWANDA_LOCATIONS_API = 'https://rda-api.kibongo.com';

const getRwandaLocations = async (path) => {
  const response = await fetch(`${RWANDA_LOCATIONS_API}${path}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) {
    throw new Error(result.message || 'Unable to load Rwanda address options.');
  }
  return result.data;
};

const apiRequest = async (path, options = {}) => {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
  } catch {
    throw new Error('Unable to reach the API. Check the backend server and local proxy configuration.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    throw new Error(data.message || `API request failed with HTTP ${response.status}. Check the backend route and CORS configuration.`);
  }
  if (!isJson) throw new Error('The API returned an unexpected non-JSON response.');

  return data;
};

export const register = (body) => apiRequest('/api/users', { method: 'POST', body });
export const resendOtp = (email) => apiRequest('/api/users/resend-otp', { method: 'POST', body: { email } });
export const verifyOtp = (otp) => apiRequest('/api/users/verify-otp', { method: 'POST', body: { otp } });
export const login = (body) => apiRequest('/api/users/login', { method: 'POST', body });
export const getProfile = (token) => apiRequest('/api/users/me', { token });
export const updateProfile = (token, body) => apiRequest('/api/users/me', { method: 'PATCH', token, body });
export const getUsers = (token, params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
  return apiRequest(`/api/users${query.toString() ? `?${query}` : ''}`, { token });
};
export const activateUser = (token, userId) => apiRequest(`/api/users/${userId}/activate`, { method: 'PATCH', token });
export const updateUser = (token, userId, body) => apiRequest(`/api/users/${userId}`, { method: 'PATCH', token, body });
export const deleteUser = (token, userId) => apiRequest(`/api/users/${userId}`, { method: 'DELETE', token });
export const getBanks = (token) => apiRequest('/api/banks', { token });
export const getAvailableBanks = (token) => apiRequest('/api/banks/available', { token });
export const createBank = (token, body) => apiRequest('/api/banks', { method: 'POST', token, body });
export const addBankBranch = (token, bankId, body) => apiRequest(`/api/banks/${bankId}/branches`, { method: 'POST', token, body });
export const getBankAccounts = (token, params = {}) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined));
  return apiRequest(`/api/bank-accounts${query.toString() ? `?${query}` : ''}`, { token });
};
export const getMyBankAccounts = (token) => apiRequest('/api/bank-accounts/me', { token });
export const getTransferRecipient = (token, accountNumber) => apiRequest(`/api/bank-accounts/recipients/${encodeURIComponent(accountNumber)}`, { token });
export const createBankAccount = (token, body) => apiRequest('/api/bank-accounts', { method: 'POST', token, body });
export const depositToBankAccount = (token, accountId, amount, phoneNumber) => apiRequest(`/api/bank-accounts/${accountId}/deposits`, { method: 'POST', token, body: { amount, phoneNumber } });
export const updateBankAccountStatus = (token, accountId, status) => apiRequest(`/api/bank-accounts/${accountId}/status`, { method: 'PATCH', token, body: { status } });
export const transferBetweenAccounts = (token, body) => apiRequest('/api/bank-accounts/transfer', { method: 'POST', token, body });
export const getBankAccountTransactions = (token, accountId) => apiRequest(`/api/bank-accounts/${accountId}/transactions`, { token });
export const getFinanceBanks = (token) => apiRequest('/api/payroll/banks', { token });
export const getPayrollEmployees = (token, bankId, branchId) => apiRequest(`/api/payroll/banks/${bankId}/branches/${branchId}/employees`, { token });
export const getPayrollBatches = (token, bankId) => apiRequest(`/api/payroll/banks/${bankId}/batches`, { token });
export const createPayrollBatch = (token, body) => apiRequest('/api/payroll/batches', { method: 'POST', token, body });
export const getLoans = (token) => apiRequest('/api/loans', { token });
export const createLoan = (token, body) => apiRequest('/api/loans', { method: 'POST', token, body });
export const decideLoan = (token, loanId, body) => apiRequest(`/api/loans/${loanId}/decision`, { method: 'PATCH', token, body });
export const recordLoanRepayment = (token, loanId, amount) => apiRequest(`/api/loans/${loanId}/repayments`, { method: 'POST', token, body: { amount } });
export const markLoanDefaulted = (token, loanId) => apiRequest(`/api/loans/${loanId}/default`, { method: 'PATCH', token });
export const getRwandaProvinces = () => getRwandaLocations('/provinces');
export const getRwandaDistricts = (province) => getRwandaLocations(`/districts?province=${encodeURIComponent(province)}`);
export const getRwandaSectors = (district) => getRwandaLocations(`/sectors?district=${encodeURIComponent(district)}`);
export const getRwandaCells = (district, sector) => getRwandaLocations(`/cells?district=${encodeURIComponent(district)}&sector=${encodeURIComponent(sector)}`);
export const getRwandaVillages = (district, sector, cell) => getRwandaLocations(`/villages?district=${encodeURIComponent(district)}&sector=${encodeURIComponent(sector)}&cell=${encodeURIComponent(cell)}`);
