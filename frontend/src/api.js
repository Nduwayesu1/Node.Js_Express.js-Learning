const API_URL = (import.meta.env.VITE_API_URL || 'https://node-js-express-js-learning-4.onrender.com').replace(/\/$/, '');

const apiRequest = async (path, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong. Please try again.');
  }

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
