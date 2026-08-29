export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold">DevPilot</h1>
      <p className="text-gray-500">AI-powered software engineering agent</p>

      
      <a
      href="http://localhost:8000/auth/github/login"
      className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition"
      >
        Login with GitHub
      </a>
    </main>
  );
}