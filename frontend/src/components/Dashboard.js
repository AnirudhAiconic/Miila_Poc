import React, { useState } from 'react';
import { 
  Upload, 
  Camera, 
  FileText, 
  LogOut, 
  Search, 
  Bell,
  User,
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  BarChart3
} from 'lucide-react';
import WorksheetUpload from './WorksheetUpload';
import ResultsDisplay from './ResultsDisplay';
import AskFromImage from './AskFromImage';

const Dashboard = ({ onLogout }) => {
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyScreen, setShowApiKeyScreen] = useState(true);
  const [activeTab, setActiveTab] = useState('upload');
  const [results, setResults] = useState(null);
  const [logoError, setLogoError] = useState(false);
  const [triedPng, setTriedPng] = useState(false);
  const [user] = useState(() => {
    const userData = localStorage.getItem('miila_user');
    return userData ? JSON.parse(userData) : { name: 'User', email: 'user@example.com' };
  });

  // Check if API key is already set
  React.useEffect(() => {
    const savedApiKey = localStorage.getItem('miila_api_key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
      setShowApiKeyScreen(false);
    }
  }, []);

  const handleApiKeySubmit = (key) => {
    setApiKey(key);
    localStorage.setItem('miila_api_key', key);
    setShowApiKeyScreen(false);
  };

  const handleWorksheetAnalyzed = (analysisResults) => {
    setResults(analysisResults);
    setActiveTab('results');
  };

  // Show API Key screen first
  if (showApiKeyScreen) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        {/* Left Sidebar */}
        <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center mt-20 ml-4 rounded-l-xl">
          <div className="py-4 border-b border-gray-200 w-full" />

          {/* Navigation Icons */}
          <nav className="flex flex-col space-y-3 flex-1 py-4">
            <button
              className="p-2 rounded-lg text-gray-400"
              title="Upload Worksheet"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            
            <button
              className="p-2 rounded-lg bg-blue-100 text-blue-600 border-l-4 border-blue-600"
              title="API Key"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </button>
            
            <button
              className="p-2 rounded-lg text-gray-400"
              disabled
              title="Results"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </nav>

          {/* Bottom Icons */}
          <div className="flex flex-col space-y-3 mt-auto">
            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            
            <button
              onClick={onLogout}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 rounded-tr-xl mt-4 mr-4">
            <div className="px-6">
              <div className="flex justify-between items-center h-16">
                {/* Page Title */}
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">API Key</h1>
                </div>

                {/* Search Bar - Center */}
                <div className="flex-1 max-w-lg mx-8">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      className="w-full pl-10 pr-12 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                      placeholder="Search..."
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <span className="text-xs text-gray-400">⌘K</span>
                    </div>
                  </div>
                </div>

                {/* User Menu - Right */}
                <div className="flex items-center space-x-4">
                  <button className="p-2 text-gray-400 hover:text-gray-600 relative">
                    <Bell className="h-6 w-6" />
                    <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                  </button>
                  
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-white">{user.name.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="hidden md:block">
                      <p className="text-sm font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </header>

          {/* API Key Content */}
          <div className="bg-white mr-4 mb-4 rounded-br-xl shadow-sm flex-1">
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-md px-6">
                <div className="text-center mb-8">
                  <h1 className="text-2xl font-semibold text-gray-900 mb-2">API Key</h1>
                  <p className="text-gray-600">Enter your OpenAI API key to enable worksheet analysis</p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => {
                        console.log('API Key input:', e.target.value.length, 'chars');
                        setApiKey(e.target.value);
                      }}
                      placeholder="sk-..."
                      className="w-full px-4 py-3 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        console.log('Accept clicked, API key:', apiKey);
                        handleApiKeySubmit(apiKey);
                      }}
                      disabled={!apiKey || apiKey.length < 10}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stats = results ? {
    total: results.problems?.length || 0,
    perfect: results.problems?.filter(p => p.status === 'perfect').length || 0,
    needSteps: results.problems?.filter(p => p.status === 'correct_no_steps').length || 0,
    wrong: results.problems?.filter(p => p.status === 'wrong').length || 0,
    empty: results.problems?.filter(p => p.status === 'empty').length || 0
  } : { total: 0, perfect: 0, needSteps: 0, wrong: 0, empty: 0 };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left Sidebar */}
      <div className="w-14 bg-transparent flex flex-col items-center mt-16 ml-4">
        <div className="w-full h-2" />
        <nav className="flex flex-col space-y-3 flex-1 py-4">
          <button
            onClick={() => setActiveTab('upload')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'upload'
                ? 'bg-blue-100 text-blue-600 border-l-4 border-blue-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            title="Upload Worksheet"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </button>

          <button
            onClick={() => setActiveTab('tutor')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'tutor'
                ? 'bg-blue-100 text-blue-600 border-l-4 border-blue-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            title="AI Tutoring"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          
          <button
            onClick={() => setActiveTab('apikey')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'apikey'
                ? 'bg-blue-100 text-blue-600 border-l-4 border-blue-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            title="API Key"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </button>
          
          <button
            onClick={() => setActiveTab('results')}
            className={`p-2 rounded-lg transition-colors ${
              activeTab === 'results'
                ? 'bg-blue-100 text-blue-600 border-l-4 border-blue-600'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
            disabled={!results}
            title="Results"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </nav>
        <div className="flex flex-col space-y-3 mt-auto">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          <button
            onClick={onLogout}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="mt-3 mr-4 -ml-20">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-4 py-2 flex items-center justify-between">
            {/* Logo left (small) */}
            <div className="text-gray-900 pl-2">
              {!logoError ? (
                <img
                  src={triedPng ? '/logo.png' : '/logo.svg'}
                  alt="Miila"
                  className="h-14"
                  onError={() => {
                    if (!triedPng) {
                      setTriedPng(true);
                    } else {
                      setLogoError(true);
                    }
                  }}
                />
              ) : (
                <div className="text-xl font-bold" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>miila</div>
              )}
            </div>

            {/* Center pill search */}
            <div className="flex-1 max-w-xl mx-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="w-full pl-10 pr-12 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Search..."
                />
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <span className="text-xs text-gray-400">⌘K</span>
                </div>
              </div>
            </div>

            {/* User on right */}
            <div className="flex items-center space-x-4 pr-2">
              <button className="p-2 text-gray-400 hover:text-gray-600 relative">
                <Bell className="h-6 w-6" />
                <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
              </button>
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-white">{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="hidden md:block">
                  <p className="text-sm font-medium text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="bg-white mr-4 mb-4 mt-3 rounded-b-xl shadow-sm flex-1">
          <div className="px-8 py-8 h-full">

        {/* Tab Content */}
        <div>
          {activeTab === 'upload' && (
            <WorksheetUpload apiKey={apiKey} onWorksheetAnalyzed={handleWorksheetAnalyzed} />
          )}

          {activeTab === 'tutor' && (
            <AskFromImage />
          )}
          
          {activeTab === 'apikey' && (
            <div className="max-w-2xl mx-auto">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-gray-900 mb-2">API Key</h1>
                <p className="text-gray-600">Enter your OpenAI API key to enable worksheet analysis</p>
              </div>
              
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Your API key is used securely and not stored permanently
                    </p>
                  </div>
                  
                  <div className="flex justify-center">
                    <button
                      onClick={() => {
                        if (apiKey) {
                          setActiveTab('upload');
                        }
                      }}
                      disabled={!apiKey}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-6 rounded transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'results' && results && (
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 lg:col-span-9">
                <ResultsDisplay results={results} />
              </div>
              <aside className="col-span-12 lg:col-span-3">
                <div className="sticky top-24 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Results</h3>
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className="text-3xl font-bold text-gray-900">{stats.total.toString().padStart(2, '0')}</div>
                      <div className="text-sm text-gray-600">Total</div>
                      <div className="text-xs text-gray-500">Total exercise fields</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-3xl font-bold text-green-600">{stats.perfect.toString().padStart(2, '0')}</div>
                      <div className="text-sm text-gray-600">Perfect ●</div>
                      <div className="text-xs text-gray-500">Right solution</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-3xl font-bold text-orange-600">{stats.needSteps.toString().padStart(2, '0')}</div>
                      <div className="text-sm text-gray-600">Need Steps ●</div>
                      <div className="text-xs text-gray-500">Extra effort to make it done</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-3xl font-bold text-red-600">{stats.wrong.toString().padStart(2, '0')}</div>
                      <div className="text-sm text-gray-600">Wrong ●</div>
                      <div className="text-xs text-gray-500">Not right solution</div>
                    </div>
                    
                    <div className="text-center">
                      <div className="text-3xl font-bold text-blue-600">{stats.empty.toString().padStart(2, '0')}</div>
                      <div className="text-sm text-gray-600">Empty ●</div>
                      <div className="text-xs text-gray-500">No solution provided</div>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          )}
          
          {activeTab === 'results' && !results && (
            <div className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Yet</h3>
              <p className="text-gray-500 mb-6">Upload and analyze a worksheet to see results here.</p>
              <button
                onClick={() => setActiveTab('upload')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors duration-200"
              >
                Upload Worksheet
              </button>
            </div>
          )}
        </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
