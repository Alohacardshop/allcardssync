import React from 'react';
import { Route } from 'react-router-dom';

const Auth = React.lazy(() => import('@/pages/Auth'));
const Privacy = React.lazy(() => import('@/pages/Privacy'));

/**
 * Public routes - accessible without authentication
 */
export const publicRoutes = (
  <>
    <Route path="/auth" element={<Auth />} />
    <Route path="/privacy" element={<Privacy />} />
  </>
);
