import { lazy } from 'react';
import { Route, Navigate } from 'react-router-dom';
import { ErrorBoundaryWrapper } from '@/components/ErrorBoundaryWrapper';
import { RequireApp } from '@/components/RequireApp';
import { ProtectedLayout } from '@/components/layout/ProtectedLayout';
import { PATHS } from './paths';

// Heavy pages - lazy load (large bundles, complex UI)
const DashboardHome = lazy(() => import('@/pages/DashboardHome'));
const Index = lazy(() => import('@/pages/Index'));
const DocumentsPage = lazy(() => import('@/features/docs/pages/DocumentsPage'));
const Inventory = lazy(() => import('@/features/inventory/pages/InventoryPage'));
const Batches = lazy(() => import('@/pages/Batches'));
const BarcodePrinting = lazy(() => import('@/pages/BarcodePrinting'));
const LabelEditorPage = lazy(() => import('@/features/barcode/pages/LabelEditorPage'));
const ShopifyMapping = lazy(() => import('@/pages/ShopifyMapping'));
const ShopifySync = lazy(() => import('@/pages/ShopifySync'));
const BulkImport = lazy(() => import('@/pages/BulkImport'));
const BulkTransfer = lazy(() => import('@/pages/BulkTransfer'));
const CrossRegionTransfers = lazy(() => import('@/pages/CrossRegionTransfers'));
const GradedIntake = lazy(() => import('@/pages/intake/GradedIntake'));
const BulkIntake = lazy(() => import('@/pages/intake/BulkIntake'));
const EbayApp = lazy(() => import('@/pages/EbayApp'));
const EbaySyncDashboard = lazy(() => import('@/pages/EbaySyncDashboard'));
const TestHardwarePage = lazy(() => import('@/pages/TestHardwarePage'));
const QzTrayTestPage = lazy(() => import('@/pages/QzTrayTestPage'));

// NotFound is handled in public routes for unauthenticated access

/**
 * Protected app routes - uses ProtectedLayout which provides its own Suspense boundary
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
    
    {/* Utility Pages */}
    <Route path="/dashboard" element={<Navigate to={PATHS.dashboard} replace />} />
    <Route path={PATHS.testHardware} element={<TestHardwarePage />} />
    <Route path={PATHS.qzTrayTest} element={<QzTrayTestPage />} />
  </Route>
);
