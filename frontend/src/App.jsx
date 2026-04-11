import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Home from './pages/Home';

function App() {
  return (
    <div className="min-h-screen bg-gray-100">
      <BrowserRouter>
        <Routes>
          {/* Landing Page */}
          <Route path="/" element={<Home />} />

          {/* Optional: 404 Page */}
          <Route
            path="*"
            element={
              <div className="flex items-center justify-center h-screen text-xl">
                404 - Page Not Found
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
