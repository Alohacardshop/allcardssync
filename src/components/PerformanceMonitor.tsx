import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Activity, 
  Clock, 
  Cpu, 
  Database, 
  Zap,
  AlertTriangle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

interface PerformanceMetric {
  name: string;
  value: number;
  threshold: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
}

interface SlowQuery {
  query: string;
  duration: number;
  timestamp: Date;
  stack?: string;
}

export function PerformanceMonitor() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [slowQueries, setSlowQueries] = useState<SlowQuery[]>([]);
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Monitor performance metrics
    const updateMetrics = () => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paint = performance.getEntriesByType('paint');
      const firstPaint = paint.find(p => p.name === 'first-paint');
      const firstContentfulPaint = paint.find(p => p.name === 'first-contentful-paint');

      const newMetrics: PerformanceMetric[] = [
        {
          name: 'Page Load Time',
          value: navigation?.loadEventEnd - navigation?.loadEventStart || 0,
          threshold: 2000,
          unit: 'ms'
        },
        {
          name: 'DOM Content Loaded',
          value: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart || 0,
          threshold: 1000,
          unit: 'ms'
        },
        {
          name: 'First Paint',
          value: firstPaint?.startTime || 0,
          threshold: 1000,
          unit: 'ms'
        },
        {
          name: 'First Contentful Paint',
          value: firstContentfulPaint?.startTime || 0,
          threshold: 1500,
          unit: 'ms'
        }
      ];

      setMetrics(newMetrics);
    };

    // Monitor memory usage if supported
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usagePercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;
        setMemoryUsage(usagePercent);
      }
    };

    // Initial update
    updateMetrics();
    updateMemoryUsage();

    // Set up periodic updates
    const interval = setInterval(() => {
      updateMemoryUsage();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Performance marking utilities
  const markStart = (name: string) => {
    if (process.env.NODE_ENV === 'development') {
      performance.mark(`${name}-start`);
    }
  };

  const markEnd = (name: string) => {
    if (process.env.NODE_ENV === 'development') {
      performance.mark(`${name}-end`);
      performance.measure(name, `${name}-start`, `${name}-end`);
      
      const measure = performance.getEntriesByName(name, 'measure')[0];
      if (measure && measure.duration > 2000) {
        console.warn(`Slow operation detected: ${name} took ${measure.duration.toFixed(2)}ms`);
        
        // Add to slow queries if it's a database operation
        if (name.includes('query') || name.includes('database')) {
          setSlowQueries(prev => [
            {
              query: name,
              duration: measure.duration,
              timestamp: new Date(),
              stack: new Error().stack
            },
            ...prev.slice(0, 9) // Keep last 10
          ]);
        }
      }
    }
  };

  // Expose to global for other components to use
  useEffect(() => {
    (window as any).performanceMonitor = {
      markStart,
      markEnd
    };
  }, []);

  const getMetricColor = (metric: PerformanceMetric) => {
    if (metric.value > metric.threshold * 1.5) return 'text-red-500';
    if (metric.value > metric.threshold) return 'text-amber-500';
    return 'text-green-500';
  };

  const getMetricIcon = (metric: PerformanceMetric) => {
    if (metric.value > metric.threshold * 1.5) return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (metric.value > metric.threshold) return <Clock className="h-4 w-4 text-amber-500" />;
    return <Zap className="h-4 w-4 text-green-500" />;
  };

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-20 left-4 z-40 space-y-2">
      {/* Performance Metrics Card */}
      <Card className="w-80 bg-black/90 text-white border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Performance Monitor
          </CardTitle>
          <CardDescription className="text-xs text-gray-400">
            Development mode only
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {metrics.map((metric) => (
            <div key={metric.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getMetricIcon(metric)}
                <span className="text-xs">{metric.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-mono ${getMetricColor(metric)}`}>
                  {metric.value.toFixed(0)}{metric.unit}
                </span>
                <Badge 
                  variant={metric.value > metric.threshold ? "destructive" : "default"}
                  className="text-xs px-1 py-0"
                >
                  {metric.value <= metric.threshold ? 'Good' : 'Slow'}
                </Badge>
              </div>
            </div>
          ))}
          
          {/* Memory Usage */}
          {'memory' in performance && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2">
                  <Cpu className="h-3 w-3" />
                  Memory Usage
                </span>
                <span className={memoryUsage > 80 ? 'text-red-400' : 'text-green-400'}>
                  {memoryUsage.toFixed(1)}%
                </span>
              </div>
              <Progress 
                value={memoryUsage} 
                className="h-1"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slow Queries Alert */}
      {slowQueries.length > 0 && (
        <Card className="w-80 bg-red-900/90 text-white border-red-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              Slow Queries ({slowQueries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {slowQueries.slice(0, 3).map((query, index) => (
                <div key={index} className="text-xs">
                  <div className="font-mono truncate">{query.query}</div>
                  <div className="text-red-300">
                    {query.duration.toFixed(0)}ms - {query.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}