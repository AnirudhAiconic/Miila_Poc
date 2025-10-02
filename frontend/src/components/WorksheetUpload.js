import React, { useState, useRef } from 'react';
import { Upload, Camera, FileText, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import axios from 'axios';

const WorksheetUpload = ({ apiKey, onWorksheetAnalyzed }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setError('');
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreview(e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      setError('Please select a valid image file (PNG, JPG, JPEG)');
    }
  };

  const handleFileInputChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFile || !apiKey) {
      setError('Please select a file and enter your API key');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Sending API key:', apiKey ? `${apiKey.substring(0, 10)}... (${apiKey.length} chars)` : 'No API key');
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('api_key', apiKey);

      // Call your Python backend API
      const response = await axios.post('http://localhost:8000/analyze-worksheet', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data) {
        onWorksheetAnalyzed(response.data);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError(err.response?.data?.error || 'Failed to analyze worksheet. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCameraCapture = () => {
    // This would typically open camera interface
    // For now, just trigger file input
    fileInputRef.current?.click();
  };

  return (
    <div className="flex h-full">
      {/* Main Content Area */}
      <div className="flex-1 bg-white">
        {/* Tab Headers */}
        <div className="border-b border-gray-200 px-6 pt-4">
          <nav className="flex space-x-8">
            <button className="pb-3 text-sm font-medium text-gray-900 border-b-2 border-blue-500">
              Original Worksheet
            </button>
            <button className="pb-3 text-sm font-medium text-gray-500 hover:text-gray-700">
              Scan with camera
            </button>
            <button className="pb-3 px-4 py-1 text-sm font-medium bg-blue-600 text-white rounded">
              Browse file
            </button>
            <button className="pb-3 text-sm font-medium text-gray-500 hover:text-gray-700">
              Digital Preview / Feedback
            </button>
          </nav>
        </div>

        {/* Upload Content Area */}
        <div className="p-8">
          <div
            className={`border-2 border-dashed rounded-lg p-20 text-center transition-colors cursor-pointer ${
              dragActive
                ? 'border-blue-400 bg-blue-50'
                : selectedFile
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {preview ? (
              <div className="space-y-4">
                <img
                  src={preview}
                  alt="Worksheet preview"
                  className="max-h-64 mx-auto rounded-lg shadow-sm"
                />
                <div className="flex items-center justify-center text-green-600">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span className="font-medium">File selected: {selectedFile.name}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="text-gray-400">
                  <Upload className="mx-auto h-16 w-16" />
                </div>
                <div>
                  <p className="text-xl text-gray-700 mb-2">
                    Drop your worksheet here
                  </p>
                  <p className="text-gray-500">
                    or click to browse files
                  </p>
                </div>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start mt-4">
              <AlertCircle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
              <span className="text-red-700">{error}</span>
            </div>
          )}

          {/* Analyze Button */}
          <button
            onClick={handleAnalyze}
            disabled={!selectedFile || !apiKey || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <Loader className="animate-spin h-5 w-5 mr-2" />
                Analyzing worksheet...
              </div>
            ) : (
              'Analyze Worksheet'
            )}
          </button>

          {!apiKey && (
            <p className="text-orange-600 text-center mt-2">
              Please set your API key first in the API Key tab
            </p>
          )}
        </div>
      </div>

      {/* Results Sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Results</h3>
        <div className="space-y-6">
          <div className="text-right">
            <div className="text-4xl font-bold text-gray-900 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Total</div>
            <div className="text-xs text-gray-500">Total exercise fields</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-green-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Perfect</div>
            <div className="text-xs text-gray-500">Right solution</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-orange-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Need Steps</div>
            <div className="text-xs text-gray-500">Extra effort to make it done</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-red-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Wrong</div>
            <div className="text-xs text-gray-500">Not right solution</div>
          </div>
          
          <div className="text-right">
            <div className="text-4xl font-bold text-blue-600 mb-1">00</div>
            <div className="text-sm font-medium text-gray-900 mb-1">Empty</div>
            <div className="text-xs text-gray-500">No solution provided</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorksheetUpload;
