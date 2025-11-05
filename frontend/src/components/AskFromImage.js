import React from 'react';

const AskFromImage = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-8">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">AI Tutoring (Teacher View)</h1>
          <p className="text-gray-700">
            Voice tutoring runs on the student device inside the Student Publisher → AI Tutor tab.
            This page will later show conversation logs for the teacher.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AskFromImage;
