import React, { useRef, useState } from 'react';
import axios from 'axios';
import { Upload, Volume2, Loader } from 'lucide-react';

const AskFromImage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState('');
  const [stepIndex, setStepIndex] = useState(0);
  const [messages, setMessages] = useState([]);
  const inputRef = useRef(null);

  const onFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setSelectedFile(file);
    setError('');
    const r = new FileReader();
    r.onload = e => setPreview(e.target.result);
    r.readAsDataURL(file);
  };

  const handleAsk = async () => {
    if (!selectedFile && stepIndex === 0) {
      setError('Please choose an image to upload.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Conversational call
      const form = new FormData();
      if (selectedFile) form.append('file', selectedFile);
      form.append('step_index', String(stepIndex));
      if (conversationId) form.append('conversation_id', conversationId);
      const res = await axios.post('http://localhost:8000/tutor/next', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const cid = res.data.conversation_id || conversationId;
      setConversationId(cid);

      const recognized = res.data.recognized_text || '';
      const tutor = res.data.tutor_message || '';
      const done = !!res.data.done;
      const finalAnswer = res.data.final_answer || '';

      if (recognized) setMessages(m => [...m, { role: 'student', text: recognized }]);
      if (tutor && !done) setMessages(m => [...m, { role: 'tutor', text: tutor }]);

      setExtracted(recognized);
      setAnswer(done ? finalAnswer : '');
      if (!done) setStepIndex(s => s + 1);
    } catch (e) {
      setError(e.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const speak = () => {
    if (!answer) return;
    try {
      const utter = new SpeechSynthesisUtterance(answer);
      utter.lang = 'en-US';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center pt-8">
      <div className="w-full max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">AI Tutoring</h1>
          <p className="text-gray-600 mb-4">Upload your sheet for this step. The tutor will give a hint for the next one.</p>

          <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-gray-400" onClick={() => inputRef.current?.click()}>
            {preview ? (
              <img src={preview} alt="preview" className="max-h-64 mx-auto rounded" />
            ) : (
              <div className="text-gray-400">
                <Upload className="mx-auto h-12 w-12" />
                <p className="mt-2">Click to choose an image</p>
              </div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => inputRef.current?.setAttribute('capture', 'environment') || inputRef.current?.click()}
              className="text-sm text-black hover:text-black"
            >
              Or scan with camera
            </button>
          </div>


          {error && (
            <div className="bg-red-50 border border-red-200 rounded mt-4 p-3 text-sm text-red-700">{error}</div>
          )}

          <div className="mt-4">
            <button onClick={handleAsk} disabled={loading || (!selectedFile && stepIndex===0)} className="bg-black hover:bg-gray-900 text-white font-medium py-2 px-4 rounded disabled:opacity-50">
              {loading ? (<span className="inline-flex items-center"><Loader className="h-4 w-4 mr-2 animate-spin"/>Processing...</span>) : 'Process Image'}
            </button>
          </div>
        </div>

        {(messages.length > 0 || answer) && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Conversation</h2>
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'tutor' ? 'bg-blue-50 p-3 rounded' : 'bg-gray-50 p-3 rounded'}>
                  <div className="text-xs text-gray-500 mb-1">{m.role === 'tutor' ? 'Tutor' : 'Student'}</div>
                  <div className="text-gray-800 whitespace-pre-wrap">{m.text}</div>
                </div>
              ))}
            </div>

            {answer && (
              <div className="mt-6">
                <div className="flex items-start justify-between">
                  <div className="pr-4">
                    <h2 className="text-lg font-semibold text-gray-900">Final Answer</h2>
                    <div className="prose prose-sm max-w-none text-gray-800">
                      <p className="whitespace-pre-wrap">{answer}</p>
                    </div>
                  </div>
                  <button onClick={speak} className="p-2 rounded bg-gray-100 hover:bg-gray-200" title="Play answer">
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-4">
                  <button onClick={() => { setConversationId(''); setStepIndex(0); setMessages([]); setExtracted(''); setAnswer(''); setSelectedFile(null); setPreview(null); }} className="text-sm text-blue-600 hover:text-blue-700">Restart</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AskFromImage;


