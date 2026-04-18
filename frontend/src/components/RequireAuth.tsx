import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

/**
 * Wraps routes to enforce authentication and optional role-based access.
 * If user is not authenticated → redirects to /login.
 * If user doesn't have required role → redirects to /dashboard with an error.
 */
export default function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
