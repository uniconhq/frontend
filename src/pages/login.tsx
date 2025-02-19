import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { login } from "@/api";
import ErrorAlert from "@/components/form/fields/error-alert";
import PasswordField from "@/components/form/fields/password-field";
import TextField from "@/components/form/fields/text-field";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { useUserStore } from "@/store/user/user-store-provider";

const loginFormSchema = z.object({
  username: z.string().min(1, "Username required"),
  password: z.string().min(1, "Password required"),
});

const loginFormDefault = {
  username: "",
  password: "",
};

type LoginForm = z.infer<typeof loginFormSchema>;

const Login = () => {
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: loginFormDefault,
  });

  const [isError, setIsError] = useState(false);
  const { user, setUser, isLoading } = useUserStore((store) => store);
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (isLoading || user) {
    return;
  }

  const onSubmit: SubmitHandler<LoginForm> = async (data) => {
    const response = await login({
      body: data,
      headers: undefined,
      withCredentials: true,
    });

    if (response.error) {
      setIsError(true);
    } else {
      setIsError(false);
      setUser(response.data.user);
      navigate("/");
    }
  };

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <h1 className="font-mono text-5xl text-purple-400">Unicon 🦄</h1>
        <h2 className="mt-1 text-xl italic text-neutral-300">
          <span className="text-purple-400 underline">Uni</span>versal Programming{" "}
          <span className="text-purple-400 underline">Con</span>
          test Platform
        </h2>
        <Card className="mt-8 w-full border-neutral-500 bg-neutral-800 p-6 sm:max-w-lg">
          <CardContent>
            <Box className="space-y-6">
              {isError && <ErrorAlert message={" Your username or password is incorrect. Please try again."} />}
              <Form {...form}>
                <form className="space-y-10" onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="space-y-4">
                    <TextField label="Username" name="username" />
                    <PasswordField label="Password" name="password" />
                  </div>
                  <Button
                    className="w-full bg-violet-600 text-white hover:bg-violet-600 hover:opacity-80"
                    type="submit"
                  >
                    Log in
                  </Button>
                </form>
              </Form>
            </Box>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link to="/signup" className="text-violet-300 hover:opacity-80">
              Don't have an account? Sign up.
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default Login;
