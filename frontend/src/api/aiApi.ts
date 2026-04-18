import axios from 'axios';

/**
 * Dedicated axios instance for the AI Service microservice.
 * This interacts directly with the Python/FastAPI service.
 */
const aiApi = axios.create({
  baseURL: import.meta.env.VITE_AI_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Note: We don't necessarily need authentication on the health check, 
// but if we call analysis endpoints directly, we might need a service key.

export default aiApi;
