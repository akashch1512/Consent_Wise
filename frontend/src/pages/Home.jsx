import bearImg from '../assets/images/bear.jpg';

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
      {/* ── Navbar ── */}
      <header className="w-full bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <span className="text-2xl font-extrabold tracking-tight text-[#58cc02]">
          CivicSeed
        </span>
        <button className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors duration-150 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          ENGLISH
          <svg
            className="w-3.5 h-3.5 mt-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </header>

      {/* ── Hero ── */}
      <main className="flex-1 flex items-center justify-center px-6 py-14">
        <div className="w-full max-w-5xl flex flex-col md:flex-row items-center gap-12 md:gap-20">
          {/* Mascot */}
          <div className="flex-shrink-0 flex justify-center w-full md:w-auto">
            <div className="w-64 h-64 md:w-80 md:h-80 rounded-3xl overflow-hidden bg-[#fce9ef] shadow-md flex items-center justify-center">
              <img
                src={bearImg}
                alt="CivicSeed mascot"
                className="object-contain w-64 mx-auto md:w-80"
              />
            </div>
          </div>

          {/* Content */}
          <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-md w-full">
            {/* Eyebrow */}
            <span className="inline-block text-xs font-bold tracking-widest text-[#58cc02] uppercase mb-4 px-3 py-1 bg-[#f0fde4] rounded-full">
              Life Skills for Kids
            </span>

            {/* Headline */}
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-4">
              Learn life skills
              <br />
              <span className="text-[#58cc02]">the smart way.</span>
            </h1>

            {/* Description */}
            <p className="text-base md:text-lg text-gray-500 leading-relaxed mb-8 max-w-sm">
              Simple, engaging lessons on civic sense, safety, habits, and
              responsibility — designed for curious young minds.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col gap-3 w-full md:w-auto">
              <button className="w-full md:w-auto bg-[#58cc02] hover:bg-[#4db800] active:scale-95 text-white text-base font-bold py-4 px-10 rounded-2xl shadow-md transition-all duration-150 tracking-wide">
                Get Started
              </button>
              <button className="w-full md:w-auto border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 active:scale-95 text-gray-500 hover:text-gray-700 text-sm font-semibold py-3.5 px-10 rounded-2xl transition-all duration-150">
                I already have an account
              </button>
            </div>

            {/* Subtle stats row */}
            <div className="flex items-center gap-6 mt-10 text-center md:text-left">
              <div>
                <p className="text-xl font-extrabold text-gray-900">50K+</p>
                <p className="text-xs text-gray-400 font-medium">Learners</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-xl font-extrabold text-gray-900">100+</p>
                <p className="text-xs text-gray-400 font-medium">Lessons</p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-xl font-extrabold text-gray-900">Free</p>
                <p className="text-xs text-gray-400 font-medium">To start</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="w-full border-t border-gray-100 bg-white py-5 px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="text-sm font-bold text-[#58cc02]">CivicSeed</span>
        <p className="text-xs text-gray-400">
          © {new Date().getFullYear()} CivicSeed. All rights reserved.
        </p>
        <div className="flex gap-4">
          <a
            href="#"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Privacy
          </a>
          <a
            href="#"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Terms
          </a>
        </div>
      </footer>
    </div>
  );
}
