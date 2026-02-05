import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ErrorBoundaryWrapper } from '@/components/ErrorBoundaryWrapper';
import { RequireApp } from '@/components/RequireApp';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { PATHS } from './paths';

// Lazy load pages
const DashboardHome = React.lazy(() => import('@/pages/DashboardHome'));
const Index = React.lazy(() => import('@/pages/Index'));
const DocumentsPage = React.lazy(() => import('@/features/docs/pages/DocumentsPage'));
const TestHardwarePage = React.lazy(() => import('@/pages/TestHardwarePage'));
const Inventory = React.lazy(() => import('@/features/inventory/pages/InventoryPage'));
const Batches = React.lazy(() => import('@/pages/Batches'));
const NotFound = React.lazy(() => import('@/pages/NotFound'));
const BarcodePrinting = React.lazy(() => import('@/pages/BarcodePrinting'));
const LabelEditorPage = React.lazy(() => import('@/features/barcode/pages/LabelEditorPage'));
const ShopifyMapping = React.lazy(() => import('@/pages/ShopifyMapping'));
const ShopifySync = React.lazy(() => import('@/pages/ShopifySync'));
const BulkImport = React.lazy(() => import('@/pages/BulkImport'));
const BulkTransfer = React.lazy(() => import('@/pages/BulkTransfer'));
const CrossRegionTransfers = React.lazy(() => import('@/pages/CrossRegionTransfers'));
const GradedIntake = React.lazy(() => import('@/pages/intake/GradedIntake'));
const BulkIntake = React.lazy(() => import('@/pages/intake/BulkIntake'));
const QzTrayTestPage = React.lazy(() => import('@/pages/QzTrayTestPage'));
const EbayApp = React.lazy(() => import('@/pages/EbayApp'));
const EbaySyncDashboard = React.lazy(() => import('@/pages/EbaySyncDashboard'));

/**
 * Protected app routes - uses ProtectedLayout (AppShell with auth)
 */
export const appRoutes = (
  <Route element={<ProtectedLayout />}>
    {/* Dashboard Home */}
    <Route path={PATHS.dashboard} element={<ErrorBoundaryWrapper componentName="DashboardHome"><DashboardHome /></ErrorBoundaryWrapper>} />
    
    {/* Intake App */}
    <Route path={PATHS.intake} element={
      <RequireApp appKey="intake">
        <ErrorBoundaryWrapper componentName="Intake"><Index /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    <Route path={PATHS.intakeGraded} element={<RequireApp appKey="intake"><GradedIntake /></RequireApp>} />
    <Route path={PATHS.intakeBulk} element={<RequireApp appKey="intake"><BulkIntake /></RequireApp>} />
    
    {/* Inventory App */}
    <Route path={PATHS.inventory} element={
      <RequireApp appKey="inventory">
        <ErrorBoundaryWrapper componentName="Inventory"><Inventory /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    <Route path={PATHS.batches} element={<RequireApp appKey="inventory"><ErrorBoundaryWrapper componentName="Batch Management"><Batches /></ErrorBoundaryWrapper></RequireApp>} />
    <Route path={PATHS.bulkImport} element={<RequireApp appKey="inventory"><BulkImport /></RequireApp>} />
    <Route path={PATHS.bulkTransfer} element={<RequireApp appKey="inventory"><BulkTransfer /></RequireApp>} />
    <Route path={PATHS.crossRegionTransfers} element={<RequireApp appKey="inventory"><CrossRegionTransfers /></RequireApp>} />
    <Route path={PATHS.shopifyMapping} element={<RequireApp appKey="inventory"><ShopifyMapping /></RequireApp>} />
    <Route path={PATHS.shopifySync} element={<RequireApp appKey="inventory"><ShopifySync /></RequireApp>} />
    
    {/* Barcode App */}
    <Route path={PATHS.barcodePrinting} element={
      <RequireApp appKey="barcode">
        <ErrorBoundaryWrapper componentName="BarcodePrinting"><BarcodePrinting /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    <Route path={PATHS.labelEditor} element={
      <RequireApp appKey="barcode">
        <ErrorBoundaryWrapper componentName="LabelEditor"><LabelEditorPage /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    
    {/* Documents App */}
    <Route path={PATHS.docs} element={
      <RequireApp appKey="docs">
        <ErrorBoundaryWrapper componentName="Documents"><DocumentsPage /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    
    {/* eBay App */}
    <Route path={PATHS.ebay} element={
      <RequireApp appKey="ebay">
        <ErrorBoundaryWrapper componentName="eBay"><EbayApp /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    <Route path={PATHS.ebaySync} element={
      <RequireApp appKey="ebay">
        <ErrorBoundaryWrapper componentName="eBaySyncDashboard"><EbaySyncDashboard /></ErrorBoundaryWrapper>
      </RequireApp>
    } />
    
    {/* Other Pages */}
    <Route path="/dashboard" element={<Navigate to={PATHS.dashboard} replace />} />
    <Route path={PATHS.testHardware} element={<TestHardwarePage />} />
    <Route path={PATHS.qzTrayTest} element={<QzTrayTestPage />} />
    
    {/* Catch-all */}
    <Route path="*" element={<NotFound />} />
  </Route>
);
