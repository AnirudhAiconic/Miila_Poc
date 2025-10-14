import React, { useState } from 'react';
import { 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  HelpCircle, 
  Eye,
  Download,
  RotateCcw,
  Lightbulb,
  Calculator
} from 'lucide-react';

const ResultsDisplay = ({ results }) => {
  const [selectedProblem, setSelectedProblem] = useState(null);
  
  const handleExport = () => {
    try {
      if (results && results.annotated_image) {
        const link = document.createElement('a');
        link.href = `data:image/png;base64,${results.annotated_image}`;
        link.download = 'miila_report.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch {}
  };

  if (!results || !results.problems) {
    return (
      <div className="card p-8 text-center">
        <AlertCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Available</h3>
        <p className="text-gray-500">Please upload and analyze a worksheet first.</p>
      </div>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'perfect':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'correct_no_steps':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'wrong':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'empty':
        return <HelpCircle className="h-5 w-5 text-blue-500" />;
      default:
        return <HelpCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'perfect':
        return 'status-perfect';
      case 'correct_no_steps':
        return 'status-need-steps';
      case 'wrong':
        return 'status-wrong';
      case 'empty':
        return 'status-empty';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'perfect':
        return 'Right solution';
      case 'correct_no_steps':
        return 'Extra effort to make it done';
      case 'wrong':
        return 'Not right solution';
      case 'empty':
        return 'No solution provided';
      default:
        return 'Unknown status';
    }
  };

  const getStatusSymbol = (status) => {
    switch (status) {
      case 'perfect':
        return '✓✓';
      case 'correct_no_steps':
        return '✓?';
      case 'wrong':
        return '✗';
      case 'empty':
        return '?';
      default:
        return '?';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Results</h1>
          <p className="text-gray-600 mt-1">
            Analysis complete - {results.problems.length} problems analyzed
          </p>
        </div>
        
        <div className="flex space-x-3">
          <button className="btn-secondary flex items-center" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button className="btn-secondary flex items-center">
            <RotateCcw className="h-4 w-4 mr-2" />
            Re-analyze
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worksheet Image */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Eye className="h-5 w-5 mr-2" />
            Digital Preview / Feedback
          </h3>
          
          {results.annotated_image ? (
            <div className="space-y-4">
              <img
                src={`data:image/png;base64,${results.annotated_image}`}
                alt="Analyzed worksheet"
                className="w-full rounded-lg shadow-sm border"
              />
              <p className="text-sm text-gray-600 text-center">
                Worksheet with color-coded feedback boxes
              </p>
            </div>
          ) : (
            <div className="bg-gray-100 rounded-lg p-8 text-center">
              <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No annotated image available</p>
            </div>
          )}
        </div>

        {/* Results Summary */}
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">
                {results.problems.length.toString().padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600">Total</div>
              <div className="text-xs text-gray-500 mt-1">Total exercise fields</div>
            </div>
            
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-green-600">
                {results.problems.filter(p => p.status === 'perfect').length.toString().padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600">Perfect</div>
              <div className="text-xs text-gray-500 mt-1">Right solution</div>
            </div>
            
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {results.problems.filter(p => p.status === 'correct_no_steps').length.toString().padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600">Need Steps</div>
              <div className="text-xs text-gray-500 mt-1">Extra effort to make it done</div>
            </div>
            
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-red-600">
                {results.problems.filter(p => p.status === 'wrong').length.toString().padStart(2, '0')}
              </div>
              <div className="text-sm text-gray-600">Wrong</div>
              <div className="text-xs text-gray-500 mt-1">Not right solution</div>
            </div>
          </div>

          {/* Problem List */}
          <div className="card">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Problem Analysis</h3>
            </div>
            
            <div className="divide-y divide-gray-200">
              {results.problems.map((problem, index) => (
                <div
                  key={index}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedProblem(selectedProblem === index ? null : index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(problem.status)}
                      <div>
                        <div className="font-medium text-gray-900">
                          {problem.problem || `Problem ${index + 1}`}
                        </div>
                        <div className="text-sm text-gray-600">
                          Answer: {problem.handwritten || 'Not provided'}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(problem.status)}`}>
                        {getStatusSymbol(problem.status)} {getStatusText(problem.status)}
                      </span>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  {selectedProblem === index && (
                    <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                      {/* Correct Answer */}
                      <div className="bg-green-50 rounded-lg p-3">
                        <div className="flex items-center mb-2">
                          <Calculator className="h-4 w-4 text-green-600 mr-2" />
                          <span className="font-medium text-green-800">Correct Answer</span>
                        </div>
                        <p className="text-green-700">{problem.correct_answer}</p>
                      </div>
                      
                      {/* Steps */}
                      {problem.correct_steps && problem.correct_steps.length > 0 && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <div className="flex items-center mb-2">
                            <Lightbulb className="h-4 w-4 text-blue-600 mr-2" />
                            <span className="font-medium text-blue-800">Solution Steps</span>
                          </div>
                          <ol className="list-decimal list-inside space-y-1 text-blue-700">
                            {problem.correct_steps.map((step, stepIndex) => (
                              <li key={stepIndex} className="text-sm">{step}</li>
                            ))}
                          </ol>
                        </div>
                      )}
                      
                      {/* Feedback */}
                      {problem.feedback && (
                        <div className="bg-yellow-50 rounded-lg p-3">
                          <div className="flex items-center mb-2">
                            <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                            <span className="font-medium text-yellow-800">Feedback</span>
                          </div>
                          <p className="text-yellow-700 text-sm">{problem.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
