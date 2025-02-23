import { AxiosError } from "axios";
import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export const Unauthorized = new Error("Unauthorized");
export const NotFound = new Error("Not Found");

const ERROR_404 = "Oops, it looks like the page you're looking for doesn't exist.";
const ERROR_403 = "You are not authorized to view this page.";

type OwnProps = {
  error?: AxiosError | typeof Unauthorized | typeof NotFound;
};

const ErrorPage: React.FC<OwnProps> = () => {
  const routeError = useRouteError();

  let errorMessage = "An unexpected error has occurred.";
  let errorStatus = "Something went wrong :(";

  if (isRouteErrorResponse(routeError)) {
    errorStatus = `[${routeError.status}] ${routeError.statusText}`;
    switch (routeError.status) {
      case 404:
        errorMessage = ERROR_404;
        break;
    }
  }

  if (routeError instanceof AxiosError) {
    if (routeError.response) {
      errorStatus = `[${routeError.response.status}] ${routeError.response.statusText}`;
      switch (routeError.response.status) {
        case 404:
          errorMessage = ERROR_404;
          break;
        case 403:
          errorMessage = ERROR_403;
          break;
      }
    }
  }

  if (routeError === Unauthorized) {
    errorStatus = `[403] Forbidden`;
    errorMessage = ERROR_403;
  } else if (routeError === NotFound) {
    errorStatus = `[404] Not Found`;
    errorMessage = ERROR_404;
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md text-center">
        <img src="/ohno.png" className="m-auto mb-10 w-60" />
        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{errorStatus}</h1>
        <p className="mt-4 text-muted-foreground">{errorMessage}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ErrorPage;
