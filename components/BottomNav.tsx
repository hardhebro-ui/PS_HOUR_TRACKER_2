
import React from 'react';
import { AppView } from '../types';

interface NavItemProps {
    view: AppView;
    icon: React.ReactElement;
    label: string;
    activeView: AppView;
    setActiveView: (view: AppView) => void;
}

const NavItem: React.FC<NavItemProps> = ({ view, icon, label, activeView, setActiveView }) => {
    const isActive = activeView === view;
    const activeClass = 'text-blue-600';
    const inactiveClass = 'text-gray-500';

    return (
        <button
            onClick={() => setActiveView(view)}
            className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 ${isActive ? activeClass : inactiveClass}`}
        >
            {icon}
            <span className="text-xs font-medium">{label}</span>
        </button>
    );
};

interface BottomNavProps {
    activeView: AppView;
    setActiveView: (view: AppView) => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
    return (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 shadow-md md:max-w-sm md:mx-auto md:bottom-0">
            <div className="flex justify-around h-full">
                <NavItem
                    view="home"
                    label="Home"
                    icon={
                        <svg xmlns="http://www.w.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                    }
                    activeView={activeView}
                    setActiveView={setActiveView}
                />
                <NavItem
                    view="trip"
                    label="Trip"
                    icon={
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9V3m0 18a9 9 0 00-9-9m-9 9a9 9 0 019-9" />
                        </svg>
                    }
                    activeView={activeView}
                    setActiveView={setActiveView}
                />
                <NavItem
                    view="history"
                    label="History"
                    icon={
                        <svg xmlns="http://www.w.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    }
                    activeView={activeView}
                    setActiveView={setActiveView}
                />
                <NavItem
                    view="settings"
                    label="Settings"
                    icon={
                        <svg xmlns="http://www.w.org/2000/svg" className="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    }
                    activeView={activeView}
                    setActiveView={setActiveView}
                />
            </div>
        </nav>
    );
};

export default BottomNav;