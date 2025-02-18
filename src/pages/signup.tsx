import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";

import { signup } from "@/api";
import ErrorAlert from "@/components/form/fields/error-alert";
import TextField from "@/components/form/fields/text-field";
import { Box } from "@/components/ui/box";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useUserStore } from "@/store/user/user-store-provider";

const signUpFormSchema = z
  .object({
    username: z.string().min(1, "Username required"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string().min(1, "Confirm password required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirm"],
  });

const signUpFormDefault = {
  username: "",
  password: "",
  confirmPassword: "",
};

type SignUpForm = z.infer<typeof signUpFormSchema>;

const SignUp = () => {
  const form = useForm<SignUpForm>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: signUpFormDefault,
  });

  const [isError, setIsError] = useState(false);
  const { user, setUser, isLoading } = useUserStore((store) => store);
  const navigate = useNavigate();

  const [isPasswordVisible, setIsPasswordVisible] = useState<boolean>(false);

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  if (isLoading || user) {
    return;
  }

  const onSubmit: SubmitHandler<SignUpForm> = async (data) => {
    const response = await signup({
      body: { ...data, confirm_password: data.confirmPassword },
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
              {isError && <ErrorAlert message={"Your username is already taken. Please try again."} />}
              <Form {...form}>
                <form className="space-y-10" onSubmit={form.handleSubmit(onSubmit)}>
                  <div className="space-y-4">
                    <TextField label="Username" name="username" />
                    {/* <PasswordField label="Password" name="password" />
                    <PasswordField
                      label="Confirm password"
                      name="confirmPassword"
                    /> */}
                    <Box className="flex flex-col space-y-2.5">
                      <FormField
                        control={form.control}
                        name={"password"}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="!text-current">Password</FormLabel>
                            <FormControl>
                              <Input {...field} type={isPasswordVisible ? "text" : "password"} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Box>
                    <Box className="flex flex-col space-y-2.5">
                      <FormField
                        control={form.control}
                        name={"confirmPassword"}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="!text-current">Confirm password</FormLabel>
                            <FormControl>
                              <Input {...field} type={isPasswordVisible ? "text" : "password"} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </Box>
                    <div className="flex items-center gap-x-2">
                      <Checkbox
                        checked={isPasswordVisible}
                        id="password-visibility"
                        onCheckedChange={(checkedState) =>
                          setIsPasswordVisible(checkedState === "indeterminate" ? false : checkedState)
                        }
                      />
                      <label
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        htmlFor="password-visibility"
                      >
                        Show password
                      </label>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-violet-600 text-white hover:bg-violet-600 hover:opacity-80"
                    type="submit"
                  >
                    Sign up
                  </Button>
                </form>
              </Form>
            </Box>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Link to="/" className="text-violet-300 hover:opacity-80">
              Already have an account? Log in.
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default SignUp;
