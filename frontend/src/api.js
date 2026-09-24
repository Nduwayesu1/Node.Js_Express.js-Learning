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
export const verifyOtp = (otp) => apiRequest('/api/users/verify-otp', { method: 'POST', body: { otp } });
export const login = (body) => apiRequest('/api/users/login', { method: 'POST', body });
export const getProfile = (token) => apiRequest('/api/users/me', { token });
export const updateProfile = (token, body) => apiRequest('/api/users/me', { method: 'PATCH', token, body });
export const getUsers = (token) => apiRequest('/api/users', { token });
