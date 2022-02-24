import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { catchError, timeout, map, take } from 'rxjs/operators';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';

export interface UserInformations {
  id: number;
  role: string;
  username: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  isAuth = false;
  public userInfo: UserInformations;
  logStatusChange: Subject<boolean> = new Subject<boolean>();
  logUserInfoChange: Subject<Object> = new Subject<Object>();

  constructor(private httpClient: HttpClient, private router: Router) { }

  login(url: string, oldUrl: string): void {
    let headers = new HttpHeaders();
    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', url, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      }
      ), catchError(
        err => {
          if (err.error.message === 'alreadyLogged') {
            this.redirect('/select');
          } else {
            console.error(err.error.message);
          }
          throw err;
        }
      )).pipe(take(1))
      .subscribe((response: UserInformations) => {
        const userInfo = {
          id: response.id,
          role: response.role,
          username: response.username
        };
        this.update_user_info(userInfo);
        this.update_log_status(true);
        if (oldUrl !== undefined) {
          this.router.navigateByUrl(oldUrl);
        } else {
          this.router.navigateByUrl('/select');
        }
      });
  }

  logout(): boolean {
    let is_logged: boolean = this.isAuth;

    if (is_logged === false) {
      return false;
    }

    let logged_api_url = '/ws/User/Logout';
    let headers = new HttpHeaders();

    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', logged_api_url, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      }
      ), catchError(
        err => {
          console.log('an error occured please try again');
          throw err;
        }
      )).pipe(take(1))
      .subscribe(response => {
        console.log('Successfully logged out');
        this.redirect('/login');
        this.update_log_status(false);
      });
    return is_logged;
  }

  is_logged(url?: string): void | boolean {
    let logged_api_url = '/ws/User/Logged';
    let headers = new HttpHeaders();

    headers = headers.set('accept', 'application/json');
    this.httpClient.request('GET', logged_api_url, { headers }).pipe(
      timeout(10000),
      map(res => {
        return res;
      }
      ), catchError(
        err => {
          this.update_log_status(false);
          console.log('user not logged');
          throw err;
        }
      )).pipe(take(1))
      .subscribe((response: UserInformations) => {
        if (response === null) {
          this.update_log_status(false);
          this.redirect('/login');
          return false;
        }
        const userInfo = {
          id: response.id,
          role: response.role,
          username: response.username
        };
        this.update_user_info(userInfo);
        this.update_log_status(true);

        if (url === undefined) {
          url = '/select';
        }
        this.router.navigateByUrl(url);
        return true;
      });
  }

  redirect(url: string) {
    this.router.navigateByUrl(url, { state: this.userInfo });
  }

  update_log_status(status: boolean): void {
    this.isAuth = status;
    this.logStatusChange.next(this.isAuth);
  }

  update_user_info(userInfo: UserInformations) {
    this.userInfo = userInfo;
    this.logUserInfoChange.next(this.userInfo);
  }
}

