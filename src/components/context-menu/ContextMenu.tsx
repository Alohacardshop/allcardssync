import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<any>;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  action: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  children: React.ReactNode;
  disabled?: boolean;
}

export function ContextMenu({ items, children, disabled = false }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const visibleItems = items.filter(item => !item.separator);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSelectedIndex(-1);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
        case 'ArrowDown':
          event.preventDefault();
          setSelectedIndex(prev => 
            prev < visibleItems.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : visibleItems.length - 1
          );
          break;
        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < visibleItems.length) {
            const item = visibleItems[selectedIndex];
            if (!item.disabled) {
              item.action();
              setIsOpen(false);
              setSelectedIndex(-1);
            }
          }
          break;
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, selectedIndex, visibleItems]);

  const handleContextMenu = (event: React.MouseEvent) => {
    if (disabled) return;
    
    event.preventDefault();
    event.stopPropagation();

    const rect = document.body.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Adjust position to keep menu within viewport
    const menuWidth = 220; // Estimated menu width
    const menuHeight = items.length * 36; // Estimated item height
    
    const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

    setPosition({ x: adjustedX, y: adjustedY });
    setIsOpen(true);
    setSelectedIndex(-1);
  };

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    
    item.action();
    setIsOpen(false);
    setSelectedIndex(-1);
  };

  const handleItemHover = (index: number) => {
    setSelectedIndex(index);
  };

  const menu = isOpen ? (
    <Card
      ref={menuRef}
      className="fixed z-50 min-w-48 p-1 shadow-lg border"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <Separator key={`separator-${index}`} className="my-1" />;
        }

        const visibleIndex = visibleItems.indexOf(item);
        const isSelected = visibleIndex === selectedIndex;

        return (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            onMouseEnter={() => handleItemHover(visibleIndex)}
            disabled={item.disabled}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 text-left text-sm rounded-md transition-colors',
              {
                'hover:bg-accent hover:text-accent-foreground': !item.disabled && !item.danger,
                'bg-accent text-accent-foreground': isSelected && !item.danger,
                'text-muted-foreground cursor-not-allowed': item.disabled,
                'text-destructive hover:bg-destructive hover:text-destructive-foreground': item.danger && !item.disabled,
                'bg-destructive text-destructive-foreground': item.danger && isSelected,
              }
            )}
          >
            <div className="flex items-center">
              {item.icon && (
                <item.icon className="mr-2 h-4 w-4" />
              )}
              <span>{item.label}</span>
            </div>
            {item.shortcut && (
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                {item.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </Card>
  ) : null;

  return (
    <>
      <div
        ref={triggerRef}
        onContextMenu={handleContextMenu}
        className="relative"
      >
        {children}
      </div>
      {menu && createPortal(menu, document.body)}
    </>
  );
}
