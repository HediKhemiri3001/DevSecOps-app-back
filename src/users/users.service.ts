import {
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRoleEnum } from './entities/user.entity';
import { MailerService } from '@nestjs-modules/mailer';
import { randomBytes } from 'crypto';

export enum UserEquipmentOrder {
  recent = 'recent',
  liberation = 'liberation',
}

import * as bcrypt from 'bcrypt';
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly mailerService: MailerService,
  ) {}

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  findOne(id: string): Promise<User> {
    return this.usersRepository.findOne({ where: { id: id } });
  }

  async remove(id: string): Promise<void> {
    await this.usersRepository.update(id, { deleted: true });
  }

  public mail(mail: string, username: string, password: string): void {
    this.mailerService
      .sendMail({
        to: mail,
        from: 'safajlizi199@gmail.com',
        subject: 'Account Information ✔',
        template: 'email',
        context: {
          password: password,
          username: username,
        },
      })
      .then(() => {
        console.log('success');
      })
      .catch((error) => {
        console.log(error);
      });
  }

  async create(registerdto: CreateUserDto): Promise<User> {
    const user = this.usersRepository.create(registerdto);
    user.salt = await bcrypt.genSalt();
    var password: string;
    randomBytes(36, (err, buf) => {
      if (err) {
        // Prints error
        console.log(err);
        return;
      }
      password = buf.toString().slice(-8);
    });
    user.password = await bcrypt.hash(password, user.salt);

    //mail
    this.mail(user.email, user.username, password);

    //MAILER SEND EMAIL WITH PASSWORD HERE.
    return await this.usersRepository.save(user);
  }
  async update(id: string, updateUserDto: UpdateUserDto) {
    return await this.usersRepository.update(id, updateUserDto);
  }

  async getUserByEmailOrUsername(
    email: string,
    username: string,
  ): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: [{ email }, { username }],
    });
    return user;
  }
  async updatePassword(id: string, oldpassword: string, newpassword) {
    let user = await this.usersRepository.findOne({ where: { id: id } });
    let cryptedOldpassword = await bcrypt.hash(oldpassword, user.salt);
    if (user.password == cryptedOldpassword) {
      user.password = await bcrypt.hash(newpassword, user.salt);
      let newUser = await this.usersRepository.save(user);
      return {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        role: newUser.role,
      };
    } else throw new UnauthorizedException('Mot de passe érroné.');
  }
  async updateUsername(id: string, username: string) {
    const sameUsername = await this.usersRepository.findOneBy({
      username: username,
    });
    if (sameUsername)
      throw new HttpException('User with this username already exists.', 409);
    else await this.usersRepository.update(id, { username: username });
    return await this.usersRepository.findOneBy({ id: id });
  }
  async getEquips(id: string, order: UserEquipmentOrder) {
    switch (order) {
      case UserEquipmentOrder.recent: {
        return await this.usersRepository
          .createQueryBuilder('users')
          .leftJoinAndSelect('users.equipment', 'equipment')
          .leftJoinAndSelect('equipment.project', 'project')
          .leftJoinAndSelect('equipment.property', 'property')
          .leftJoinAndSelect('equipment.category', 'category')
          .leftJoinAndSelect('project.manager', 'user')
          .where('users.id = :id', { id: id })
          .getMany();
      }
      case UserEquipmentOrder.liberation: {
        return await this.usersRepository
          .createQueryBuilder('users')
          .leftJoinAndSelect('users.equipment', 'equipment')
          .leftJoinAndSelect('equipment.project', 'project')
          .leftJoinAndSelect('equipment.property', 'property')
          .leftJoinAndSelect('equipment.category', 'category')
          .leftJoinAndSelect('project.manager', 'user')
          .where('users.id = :id', { id: id })
          .orderBy('equipment.date_lib', 'ASC')
          .getMany();
      }
    }
  }
  async addEquip(userId: string, equipId: string | string[]) {
    return await this.usersRepository
      .createQueryBuilder()
      .relation('equipment')
      .of(userId)
      .add(equipId);
  }
  async getManagedProjectsOfUser(id: string) {
    return await this.usersRepository
      .createQueryBuilder('u')
      .relation('managed')
      .of(id)
      .loadMany();
  }
  async getMemberProjectsOfUser(id: string) {
    return await this.usersRepository
      .createQueryBuilder('users')
      .leftJoinAndSelect('users.projects', 'project')
      .leftJoinAndSelect('project.manager', 'manager')
      .where('users.id = :id', { id: id })
      .getOne();
  }

  async filter(keyword: any) {
    return await this.usersRepository.find({
      where: [
        { email: Like(`%${keyword}%`) },
        { username: Like(`%${keyword}%`) },
        { firstname: Like(`%${keyword}%`) },
        { lastname: Like(`%${keyword}%`) },
        { deleted: Like(keyword) },
      ],
    });
  }
  async getManagers() {
    return await this.usersRepository.find({
      where: { role: UserRoleEnum.manager },
    });
  }
}
