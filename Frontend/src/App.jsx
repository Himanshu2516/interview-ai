import { RouterProvider } from "react-router";
import { router } from "./app.routes.jsx";
import { AuthProvider } from "./features/auth/auth.context.jsx";
import { InterviewProvider } from "./features/interview/interview.context.jsx";

function App() {

  return (
    <AuthProvider>
      <InterviewProvider>
      {/* rouetprovider - component mein hamne jo router bnaye h unko use kr liya */}
        <RouterProvider router={router} /> 
      </InterviewProvider>
    </AuthProvider>
    
  )
}

export default App
