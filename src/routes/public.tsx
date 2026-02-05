import React from 'react';
import { Route } from 'react-router-dom';
import { PATHS } from './paths';

const Auth = React.lazy(() => import('@/pages/Auth'));
const Privacy = React.lazy(() => import('@/pages/Privacy'));

/**
 * Public routes - accessible without authentication
 */
export const publicRoutes = (
  <>
    <Route path={PATHS.auth} element={<Auth />} />
    <Route path={PATHS.privacy} element={<Privacy />} />
  </>
);
